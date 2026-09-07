import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveApplicationConfig } from './config'
import { NativeCommandInterruptedError, type NativeCommandRunner } from './native-command'
import { inspectSimulatorEnvironment } from './native-doctor'

let root: string
const udid = randomUUID()
const run = vi.fn<NativeCommandRunner>()

function config() {
  return resolveApplicationConfig(root, {
    application: { id: 'org.example.reader', name: 'Reader' },
    client: { targets: { ios: { runtime: 'capacitor', backend: { origin: 'https://example.org' } } } },
  })
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'typeferry-doctor-'))
  await mkdir(path.join(root, 'ios/App/App.xcodeproj'), { recursive: true })
  run.mockReset()
  run.mockImplementation(async (executable, args) => {
    if (args.includes('-version')) return { stdout: 'Xcode 26.0\nBuild version 17A', stderr: '' }
    if (args.includes('-list')) return { stdout: JSON.stringify({ project: { schemes: ['App'] } }), stderr: '' }
    if (args.includes('devices')) return { stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ udid, name: 'Example phone', state: 'Shutdown', isAvailable: true }] } }), stderr: '' }
    return { stdout: `/Applications/Xcode.app/Contents/Developer/${executable}`, stderr: '' }
  })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('iOS simulator doctor', () => {
  it('reports ready tools, project, scheme and selected device without mutations', async () => {
    const result = await inspectSimulatorEnvironment(config(), undefined, run, 'darwin')
    expect(result.ok).toBe(true)
    expect(result.checks.some(check => check.detail.includes(udid))).toBe(true)
    const argumentsUsed = run.mock.calls.flatMap(([, args]) => args)
    for (const forbidden of ['boot', 'build', 'install', 'launch', 'erase', '-allowProvisioningUpdates']) {
      expect(argumentsUsed).not.toContain(forbidden)
    }
    expect(argumentsUsed).toContain('-list')
  })
  it('rejects non-macOS before executing Apple tools', async () => {
    expect((await inspectSimulatorEnvironment(config(), undefined, run, 'linux')).ok).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
  it('accumulates actionable independent failures', async () => {
    run.mockRejectedValue(new Error('tool unavailable'))
    await rm(path.join(root, 'ios'), { recursive: true })
    const result = await inspectSimulatorEnvironment(config(), undefined, run, 'darwin')
    expect(result.ok).toBe(false)
    expect(result.checks.filter(check => !check.ok).length).toBeGreaterThanOrEqual(5)
    expect(result.checks.every(check => check.detail.length > 0)).toBe(true)
  })
  it('reports a missing scheme', async () => {
    run.mockImplementationOnce(async () => ({ stdout: 'Xcode 26.0', stderr: '' }))
    const original = run.getMockImplementation()
    if (!original) throw new Error("Command fixture missing")
    run.mockImplementation(async (executable, args, options) => args.includes('-list')
      ? { stdout: JSON.stringify({ project: { schemes: ['Other'] } }), stderr: '' }
      : await original(executable, args, options))
    const result = await inspectSimulatorEnvironment(config(), undefined, run, 'darwin')
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'scheme', ok: false, detail: expect.stringContaining('App') }))
  })
  it('reports ambiguous devices and accepts an explicit selection', async () => {
    const original = run.getMockImplementation()
    if (!original) throw new Error("Command fixture missing")
    run.mockImplementation(async (executable, args, options) => args.includes('devices')
      ? { stdout: JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': Array.from({ length: 2 }, (_, index) => ({ udid: index === 0 ? udid : randomUUID(), name: 'Example phone', state: 'Shutdown', isAvailable: true })) } }), stderr: '' }
      : await original(executable, args, options))
    expect((await inspectSimulatorEnvironment(config(), undefined, run, 'darwin')).ok).toBe(false)
    expect((await inspectSimulatorEnvironment(config(), udid, run, 'darwin')).ok).toBe(true)
  })
  it('checks workspace schemes and lets an explicit device override configuration', async () => {
    const workspace = path.join(root, 'Reader.xcworkspace')
    await mkdir(workspace)
    const original = run.getMockImplementation()
    if (!original) throw new Error('Command fixture missing')
    run.mockImplementation(async (executable, args, options) => args.includes('-list')
      ? { stdout: JSON.stringify({ workspace: { schemes: ['Reader'] } }), stderr: '' }
      : await original(executable, args, options))
    const configured = resolveApplicationConfig(root, {
      application: { id: 'org.example.reader', name: 'Reader' },
      client: { targets: { ios: {
        runtime: 'capacitor', backend: { origin: 'https://example.org' },
        xcode: { workspace: 'Reader.xcworkspace', scheme: 'Reader' },
        simulator: { device: 'Missing configured phone' },
      } } },
    })
    expect((await inspectSimulatorEnvironment(configured, undefined, run, 'darwin')).ok).toBe(false)
    expect((await inspectSimulatorEnvironment(configured, udid, run, 'darwin')).ok).toBe(true)
    expect(run).toHaveBeenCalledWith('xcodebuild', expect.arrayContaining(['-workspace', workspace, '-list', '-json']), { cwd: root })
  })

  it('propagates user interruption instead of reporting failed configuration', async () => {
    run.mockRejectedValue(new NativeCommandInterruptedError('SIGINT'))
    await expect(inspectSimulatorEnvironment(config(), undefined, run, 'darwin')).rejects.toBeInstanceOf(NativeCommandInterruptedError)
  })
})
