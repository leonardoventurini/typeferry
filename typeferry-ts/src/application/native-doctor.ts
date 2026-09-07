import { access } from 'node:fs/promises'
import { z } from 'zod'

import type { ResolvedApplicationConfig } from './config'
import { executeNativeCommand, NativeCommandInterruptedError, type NativeCommandRunner } from './native-command'
import { readIosSimulators, selectIosSimulator } from './native-devices'
import { resolveSimulatorSettings } from './native-simulator-settings'

export interface NativeDoctorCheck {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

export interface NativeDoctorReport {
  readonly ok: boolean
  readonly checks: readonly NativeDoctorCheck[]
}

const schemeListSchema = z.object({ schemes: z.array(z.string()) })
const xcodeListSchema = z.object({
  project: schemeListSchema.optional(),
  workspace: schemeListSchema.optional(),
})

/**
 * Inspects simulator prerequisites without booting devices, compiling products,
 * installing applications or changing signing settings. A successful report is
 * not evidence of distribution signing or developer-account readiness.
 */
export async function inspectSimulatorEnvironment(
  config: ResolvedApplicationConfig,
  selector?: string,
  run: NativeCommandRunner = executeNativeCommand,
  platform: NodeJS.Platform = process.platform,
): Promise<NativeDoctorReport> {
  const checks: NativeDoctorCheck[] = []
  const check = async (name: string, advice: string, inspect: () => Promise<string>): Promise<void> => {
    try {
      checks.push({ name, ok: true, detail: await inspect() })
    } catch (error) {
      if (error instanceof NativeCommandInterruptedError) throw error
      checks.push({ name, ok: false, detail: `${advice}: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  if (platform !== 'darwin') return { ok: false, checks: [{ name: 'platform', ok: false, detail: 'iOS simulator commands require macOS with a full Xcode installation.' }] }
  checks.push({ name: 'platform', ok: true, detail: 'macOS supports the iOS simulator toolchain.' })

  await check('xcode', 'Install and select full Xcode, then complete its first-launch setup', async () => {
    const { stdout } = await run('xcodebuild', ['-version'])
    if (!/^Xcode\s+\S+/mu.test(stdout)) throw new Error('The selected developer tools did not identify a full Xcode installation')
    return stdout.trim()
  })
  await check('simctl', 'Select an Xcode installation containing Simulator tools', async () => {
    const { stdout } = await run('xcrun', ['--find', 'simctl'])
    if (!stdout.trim()) throw new Error('simctl was not found')
    return stdout.trim()
  })
  await check('sdk', 'Install the iOS simulator SDK in the selected Xcode installation', async () => {
    const { stdout } = await run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'])
    if (!stdout.trim()) throw new Error('The iOS simulator SDK was not found')
    return stdout.trim()
  })

  let settings: ReturnType<typeof resolveSimulatorSettings> | undefined
  await check('configuration', 'Configure application identity and client.targets.ios', async () => {
    settings = resolveSimulatorSettings(config)
    return `Simulator configuration for ${settings.bundleId}. Ad-hoc simulator signing preserves project entitlements; distribution signing is not checked.`
  })

  await check('device', 'Install an available iOS runtime and select an unambiguous device with --device', async () => {
    const device = selectIosSimulator(await readIosSimulators(run), selector ?? settings?.device)
    return `${device.name} (${device.udid}), ${device.runtime}, ${device.state}`
  })
  if (settings) {
    const resolved = settings
    await check('container', 'Generate or configure the Xcode project or workspace', async () => {
      await access(resolved.container.path)
      return resolved.container.path
    })
    await check('scheme', 'Select a shared application scheme from the configured Xcode project or workspace', async () => {
      const { stdout } = await run('xcodebuild', [
        `-${resolved.container.kind}`, resolved.container.path,
        '-list', '-json', '-disableAutomaticPackageResolution', '-skipPackageUpdates',
      ], { cwd: resolved.root })
      const value: unknown = JSON.parse(stdout)
      const list = xcodeListSchema.parse(value)
      const schemes = list[resolved.container.kind]?.schemes ?? []
      if (!schemes.includes(resolved.scheme)) throw new Error(`Scheme ${JSON.stringify(resolved.scheme)} is unavailable. Available schemes: ${schemes.join(', ') || '(none)'}`)
      return resolved.scheme
    })
  }
  return { ok: checks.every(item => item.ok), checks }
}
