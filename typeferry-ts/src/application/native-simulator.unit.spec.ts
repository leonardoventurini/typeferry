import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveApplicationConfig } from './config'
import type { NativeCommandRunner } from './native-command'
import { runNativeSimulator } from './native-simulator'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(state = 'Booted') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-run-'))
  roots.push(root)
  const udid = randomUUID()
  const bundleId = 'com.example.reader'
  const product = path.join(root, 'products', 'Actual Name.app')
  await mkdir(path.join(root, 'ios/App/App.xcodeproj'), { recursive: true })
  await mkdir(product, { recursive: true })
  const calls: string[][] = []
  const run: NativeCommandRunner = vi.fn(async (tool, args) => {
    calls.push([tool, ...args])
    let stdout = ''
    if (args.includes('devices')) stdout = JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ udid, name: 'Example Phone', state, isAvailable: true }] } })
    if (args.includes('-showBuildSettings')) stdout = JSON.stringify([{ buildSettings: {
      PRODUCT_BUNDLE_IDENTIFIER: bundleId, WRAPPER_EXTENSION: 'app', PLATFORM_NAME: 'iphonesimulator',
      TARGET_BUILD_DIR: path.dirname(product), FULL_PRODUCT_NAME: path.basename(product),
    } }])
    if (args.includes('CFBundleIdentifier')) stdout = bundleId
    if (args.includes('CFBundleExecutable')) stdout = 'Actual Name'
    if (args.includes('get_app_container')) stdout = product
    return { stdout, stderr: '' }
  })
  const config = resolveApplicationConfig(root, { application: { id: bundleId, name: 'Example' }, client: { targets: { ios: {
    runtime: 'capacitor', backend: { origin: 'https://example.com' }, simulator: { device: udid },
  } } } })
  const build = vi.fn(async () => { calls.push(['build-web']) })
  const sync = vi.fn(async () => { calls.push(['sync-native']) })
  const write = vi.fn()
  return { root, config, udid, product, calls, deps: { run, build, sync, write, platform: 'darwin' as const } }
}

describe('native simulator workflow', () => {
  it('builds, syncs, boots, signs, verifies and installs the resolved product before launching', async () => {
    const f = await fixture('Shutdown')
    await runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: true }, f.deps)
    expect(f.calls.map(call => call[0] === 'xcrun' ? call[2] : call[0])).toEqual([
      'list', 'build-web', 'sync-native', 'bootstatus', 'xcodebuild', 'xcodebuild', '/usr/bin/plutil', 'codesign', 'install', 'launch',
    ])
    expect(f.calls.find(call => call.includes('build') && call[0] === 'xcodebuild')).toEqual(expect.arrayContaining(['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-']))
    expect(f.calls.find(call => call.includes('install'))).toEqual(['xcrun', 'simctl', 'install', f.udid, f.product])
    expect(f.calls.flat()).not.toContain('uninstall')
    expect(f.calls.flat()).not.toContain('-allowProvisioningUpdates')
  })

  it('does not install after a failed build', async () => {
    const f = await fixture()
    f.deps.build.mockRejectedValueOnce(new Error('build failed'))
    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: true }, f.deps)).rejects.toThrow('build failed')
    expect(f.calls.flat()).not.toContain('install')
  })

  it('refuses to install when the built bundle identity differs from the configured app', async () => {
    const f = await fixture()
    const original = vi.mocked(f.deps.run).getMockImplementation()
    if (!original) throw new Error('Command fixture missing')
    vi.mocked(f.deps.run).mockImplementation(async (tool, args, options) => {
      const result = await original(tool, args, options)
      return args.includes('CFBundleIdentifier') ? { ...result, stdout: 'com.example.other' } : result
    })

    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: true }, f.deps)).rejects.toThrow(/identity does not match/u)
    expect(f.calls.flat()).not.toContain('install')
    expect(f.calls.flat()).not.toContain('launch')
    expect(f.calls.flat()).not.toContain('codesign')
  })

  it('stops before product inspection and installation when Xcode compilation fails', async () => {
    const f = await fixture()
    const original = vi.mocked(f.deps.run).getMockImplementation()
    if (!original) throw new Error('Command fixture missing')
    vi.mocked(f.deps.run).mockImplementation(async (tool, args, options) => {
      const result = await original(tool, args, options)
      if (tool === 'xcodebuild' && args.includes('build')) throw new Error('Native compilation failed')
      return result
    })

    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: true }, f.deps)).rejects.toThrow('Native compilation failed')
    expect(f.deps.build).toHaveBeenCalledOnce()
    expect(f.deps.sync).toHaveBeenCalledOnce()
    expect(f.calls.flat()).not.toContain('-showBuildSettings')
    expect(f.calls.flat()).not.toContain('install')
    expect(f.calls.flat()).not.toContain('launch')
  })

  it('rejects an invalid explicit device before building or changing any device', async () => {
    const f = await fixture()

    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: true, device: randomUUID() }, f.deps)).rejects.toThrow(/No available iOS simulator matches/u)
    expect(f.deps.build).not.toHaveBeenCalled()
    expect(f.deps.sync).not.toHaveBeenCalled()
    expect(f.calls).toEqual([['xcrun', 'simctl', 'list', 'devices', '--json']])
  })

  it('opens the GUI on the concrete selected device after booting it', async () => {
    const f = await fixture('Shutdown')

    await runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'run', headless: false }, f.deps)

    const guiIndex = f.calls.findIndex(call => call[0] === 'open')
    const bootIndex = f.calls.findIndex(call => call.includes('bootstatus'))
    expect(guiIndex).toBeGreaterThan(bootIndex)
    expect(f.calls[guiIndex]).toEqual(['open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', f.udid])
    expect(f.calls.find(call => call.includes('install'))).toEqual(['xcrun', 'simctl', 'install', f.udid, f.product])
    expect(f.calls.flat()).not.toContain('booted')
  })

  it('removes a reserved screenshot after capture fails so a retry can reuse the path', async () => {
    const f = await fixture()
    const output = path.join(f.root, 'captures', 'failed.png')
    const original = vi.mocked(f.deps.run).getMockImplementation()
    if (!original) throw new Error('Command fixture missing')
    vi.mocked(f.deps.run).mockImplementation(async (tool, args, options) => {
      const result = await original(tool, args, options)
      if (args.includes('screenshot')) {
        await writeFile(output, 'partial capture')
        throw new Error('Capture failed')
      }
      return result
    })

    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'screenshot', output }, f.deps)).rejects.toThrow('Capture failed')
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
    vi.mocked(f.deps.run).mockImplementation(original)
    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'screenshot', output }, f.deps)).resolves.toBe(true)
  })

  it('never replaces an existing screenshot and supports paths containing spaces', async () => {
    const f = await fixture()
    const output = path.join(f.root, 'screen captures', 'shot.png')
    await runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'screenshot', output }, f.deps)
    expect(f.calls.at(-1)).toEqual(['xcrun', 'simctl', 'io', f.udid, 'screenshot', '--type=png', output])
    await writeFile(output, 'existing screenshot')
    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'screenshot', output }, f.deps)).rejects.toThrow(/already exists/u)
    expect(await readFile(output, 'utf8')).toBe('existing screenshot')
  })

  it('requires a booted device for logs without changing device state', async () => {
    const f = await fixture('Shutdown')
    await expect(runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'logs' }, f.deps)).rejects.toThrow(/boot/iu)
    expect(f.calls.flat()).not.toContain('bootstatus')
  })

  it('filters live logs by the installed app executable using literal arguments', async () => {
    const f = await fixture()
    await runNativeSimulator(f.config, { command: 'native', target: 'ios', action: 'logs' }, f.deps)
    expect(f.calls.at(-1)).toEqual(['xcrun', 'simctl', 'spawn', f.udid, 'log', 'stream', '--style', 'compact', '--level', 'debug', '--predicate', 'process == "Actual Name"'])
  })
})
