import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type { ResolvedApplicationConfig } from './config'
import { fileExists, registerNativeScene, registerNativeSource, writeGeneratedFile } from './native-project'

const execute = promisify(execFile)

export async function runNative(config: ResolvedApplicationConfig, action: 'add' | 'sync' | 'open'): Promise<void> {
  const ios = config.client.targets.ios
  const identity = config.application
  if (!ios || !identity) throw new Error('Configure application identity and client.targets.ios first')
  const require = createRequire(path.join(config.root, 'package.json'))
  let cli: string
  try {
    cli = require.resolve('@capacitor/cli/bin/capacitor')
    require.resolve('@capacitor/ios/package.json')
  } catch {
    throw new Error('Install @capacitor/core, @capacitor/ios and @capacitor/cli in the application before using native commands')
  }
  for (const extension of ['ts', 'js']) {
    if (await fileExists(path.join(config.root, `capacitor.config.${extension}`))) throw new Error('Existing Capacitor configuration must be reconciled before TypeFerry can own native configuration')
  }
  await writeGeneratedFile(config.root, 'capacitor.config.json', `${JSON.stringify({
    appId: identity.id,
    appName: identity.name,
    loggingBehavior: 'none',
    webDir: 'dist/ios-web',
    ios: { path: 'ios' },
    plugins: { TypeFerryNative: { backendOrigin: ios.backend.origin, callbackScheme: identity.id } },
  }, null, 2)}\n`)
  const { stdout, stderr } = await execute(process.execPath, [cli, action, 'ios'], { cwd: config.root, maxBuffer: 8 * 1024 * 1024 })
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  if (action === 'open') return
  await configureNativeProject(config)
}

async function configureNativeProject(config: ResolvedApplicationConfig): Promise<void> {
  const { IOS_NATIVE_TEMPLATES } = await import('../native/templates/index')
  await writeGeneratedFile(config.root, 'ios/App/App/TypeFerryNative.swift', Object.values(IOS_NATIVE_TEMPLATES).join('\n'))
  const projectPath = path.join(config.root, 'ios/App/App.xcodeproj/project.pbxproj')
  const project = await readFile(projectPath, 'utf8')
  const registered = registerNativeSource(project)
  if (registered !== project) await writeFile(projectPath, registered)
  const scenePath = path.join(config.root, 'ios/App/App/SceneDelegate.swift')
  if (await fileExists(scenePath)) {
    const scene = await readFile(scenePath, 'utf8')
    const updated = registerNativeScene(scene)
    if (updated !== scene) await writeFile(scenePath, updated)
  }
  const storyboardPath = path.join(config.root, 'ios/App/App/Base.lproj/Main.storyboard')
  const storyboard = await readFile(storyboardPath, 'utf8')
  if (storyboard.includes('customClass="CAPBridgeViewController"')) {
    await writeFile(storyboardPath, storyboard.replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="TypeFerryBridgeViewController" customModule="App" customModuleProvider="target"'))
  } else if (!storyboard.includes('customClass="TypeFerryBridgeViewController"')) {
    throw new Error('Custom bridge controller detected; integrate TypeFerry native registration explicitly')
  }
  const plist = path.join(config.root, 'ios/App/App/Info.plist')
  const permissions = config.client.targets.ios?.permissions
  for (const [key, purpose] of [
    ['NSCameraUsageDescription', permissions?.camera?.purpose],
    ['NSMicrophoneUsageDescription', permissions?.microphone?.purpose],
  ] as const) {
    if (purpose) await execute('/usr/bin/plutil', ['-replace', key, '-string', purpose, plist])
  }
  const callbackScheme = config.application?.id
  if (callbackScheme) {
    const existing = await execute('/usr/bin/plutil', ['-extract', 'CFBundleURLTypes', 'json', '-o', '-', plist]).catch(() => null)
    const value: unknown = existing ? JSON.parse(existing.stdout) : []
    if (!Array.isArray(value)) throw new Error('Invalid CFBundleURLTypes in app Info.plist')
    const includesScheme = value.some((entry: unknown) => typeof entry === 'object' && entry !== null && 'CFBundleURLSchemes' in entry && Array.isArray(entry.CFBundleURLSchemes) && entry.CFBundleURLSchemes.includes(callbackScheme))
    if (!includesScheme) await execute('/usr/bin/plutil', ['-replace', 'CFBundleURLTypes', '-json', JSON.stringify([...value, { CFBundleURLName: 'TypeFerry authentication', CFBundleURLSchemes: [callbackScheme] }]), plist])
  }
}
