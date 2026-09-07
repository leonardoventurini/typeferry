import { randomUUID } from 'node:crypto'
import { access, mkdir, open, rm } from 'node:fs/promises'
import path from 'node:path'

import { runBuild } from './build'
import type { NativeCliArguments } from './cli-arguments'
import type { ResolvedApplicationConfig } from './config'
import { runNative } from './native'
import { executeNativeCommand, type NativeCommandRunner } from './native-command'
import { readIosSimulators, requireBootedSimulator, selectIosSimulator } from './native-devices'
import { inspectSimulatorEnvironment } from './native-doctor'
import { resolveSimulatorProduct, resolveSimulatorSettings, simulatorBuildArguments, type SimulatorSettings } from './native-simulator-settings'

type SimulatorCommand = Exclude<NativeCliArguments, { readonly action: 'add' | 'sync' | 'open' }>

export interface SimulatorDependencies {
  readonly run: NativeCommandRunner
  readonly build: (config: ResolvedApplicationConfig) => Promise<void>
  readonly sync: (config: ResolvedApplicationConfig) => Promise<void>
  readonly write: (message: string) => void
  readonly platform: NodeJS.Platform
}

const dependencies: SimulatorDependencies = {
  run: executeNativeCommand,
  build: config => runBuild(config, 'ios'),
  sync: config => runNative(config, 'sync'),
  write: message => process.stdout.write(`${message}\n`),
  platform: process.platform,
}

/**
 * Simulator tooling deliberately has no distribution, account, certificate or
 * data-reset operations. Each mutation targets one resolved device identifier.
 */
export async function runNativeSimulator(
  config: ResolvedApplicationConfig,
  command: SimulatorCommand,
  deps: SimulatorDependencies = dependencies,
): Promise<boolean> {
  if (command.action === 'doctor') {
    const report = await inspectSimulatorEnvironment(config, command.device, deps.run, deps.platform)
    deps.write(command.json ? JSON.stringify(report, null, 2) : report.checks.map(check => `${check.ok ? 'OK' : 'FAIL'} ${check.name}: ${check.detail}`).join('\n'))
    return report.ok
  }
  if (deps.platform !== 'darwin') throw new Error('iOS simulator commands require macOS with full Xcode installed. Run native doctor ios on a Mac.')
  const devices = await readIosSimulators(deps.run)
  if (command.action === 'devices') {
    deps.write(command.json ? JSON.stringify(devices, null, 2) : devices.map(device => `${device.udid}  ${device.name}  ${device.runtime}  ${device.state}${device.isAvailable ? '' : ' (unavailable)'}`).join('\n') || 'No iOS simulators found. Install an iOS runtime in Xcode.')
    return true
  }
  const settings = resolveSimulatorSettings(config)
  const device = selectIosSimulator(devices, command.device ?? settings.device)
  if (command.action === 'run') {
    await runApplication(config, settings, device.udid, command.headless, deps)
    return true
  }
  requireBootedSimulator(device)
  if (command.action === 'screenshot') {
    await captureScreenshot(settings, device.udid, command.output, deps)
  } else {
    await streamApplicationLogs(settings, device.udid, deps)
  }
  return true
}

async function runApplication(
  config: ResolvedApplicationConfig,
  settings: SimulatorSettings,
  udid: string,
  headless: boolean,
  deps: SimulatorDependencies,
): Promise<void> {
  await access(settings.container.path).catch(() => { throw new Error(`Xcode ${settings.container.kind} not found: ${settings.container.path}. Create the native project with native add ios or configure its location.`) })
  deps.write(`Building ${settings.bundleId} for simulator ${udid}`)
  await deps.build(config)
  await deps.sync(config)
  await deps.run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stream: true, timeoutMs: 180_000 })
  if (!headless) await deps.run('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid])
  const args = simulatorBuildArguments(settings, udid)
  await deps.run('xcodebuild', [...args, 'build'], { cwd: settings.root, stream: true, timeoutMs: 900_000 })
  const result = await deps.run('xcodebuild', [...args, '-showBuildSettings', '-json'], { cwd: settings.root })
  const product = resolveSimulatorProduct(JSON.parse(result.stdout) as unknown, settings.bundleId)
  const identity = await deps.run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(product, 'Info.plist')])
  if (identity.stdout.trim() !== settings.bundleId) throw new Error('Built app identity does not match application.id; refusing to install a different application')
  await deps.run('codesign', ['--verify', '--deep', '--strict', product])
  await deps.run('xcrun', ['simctl', 'install', udid, product])
  await deps.run('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, settings.bundleId])
  deps.write(`Launched ${settings.bundleId} on ${udid}\nApplication: ${product}`)
}

async function captureScreenshot(settings: SimulatorSettings, udid: string, requested: string | undefined, deps: SimulatorDependencies): Promise<void> {
  const output = requested
    ? path.resolve(settings.root, requested)
    : path.join(settings.derivedDataPath, 'screenshots', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.png`)
  if (path.extname(output).toLowerCase() !== '.png') throw new Error('Screenshot output must use a .png extension')
  await mkdir(path.dirname(output), { recursive: true })
  const reservation = await open(output, 'wx').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(`Screenshot already exists: ${output}. Choose a new --output path.`)
    throw error
  })
  await reservation.close()
  try {
    await deps.run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', output])
  } catch (error) {
    await rm(output, { force: true })
    throw error
  }
  deps.write(output)
}

async function streamApplicationLogs(settings: SimulatorSettings, udid: string, deps: SimulatorDependencies): Promise<void> {
  const container = await deps.run('xcrun', ['simctl', 'get_app_container', udid, settings.bundleId, 'app'])
  const executable = await deps.run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(container.stdout.trim(), 'Info.plist')])
  const name = executable.stdout.trim()
  if (!name || /[\r\n\0]/u.test(name)) throw new Error('Installed application has an invalid executable name')
  const quotedName = JSON.stringify(name)
  deps.write(`Streaming ${settings.bundleId} on ${udid}. Press Ctrl+C to stop.`)
  await deps.run('xcrun', ['simctl', 'spawn', udid, 'log', 'stream', '--style', 'compact', '--level', 'debug', '--predicate', `process == ${quotedName}`], { stream: true })
}
