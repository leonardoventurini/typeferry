import path from 'node:path'
import { z } from 'zod'

import type { ResolvedApplicationConfig } from './config'

export interface SimulatorSettings {
  readonly root: string
  readonly bundleId: string
  readonly container: { readonly kind: 'project' | 'workspace'; readonly path: string }
  readonly scheme: string
  readonly configuration: string
  readonly derivedDataPath: string
  readonly device?: string
}

/**
 * Xcode defaults follow the generated Capacitor app. Application signing/team
 * settings are deliberately read from its project rather than framework config.
 */
export function resolveSimulatorSettings(config: ResolvedApplicationConfig): SimulatorSettings {
  const ios = config.client.targets.ios
  if (!ios || !config.application) throw new Error('Configure application identity and client.targets.ios first')
  const xcode = ios.xcode
  return {
    root: config.root,
    bundleId: config.application.id,
    container: xcode?.workspace
      ? { kind: 'workspace', path: path.resolve(config.root, xcode.workspace) }
      : { kind: 'project', path: path.resolve(config.root, xcode?.project ?? 'ios/App/App.xcodeproj') },
    scheme: xcode?.scheme ?? 'App',
    configuration: xcode?.configuration ?? 'Debug',
    derivedDataPath: path.resolve(config.root, xcode?.derivedDataPath ?? 'ios/DerivedData/Simulator'),
    ...(ios.simulator?.device ? { device: ios.simulator.device } : {}),
  }
}

export function simulatorBuildArguments(settings: SimulatorSettings, udid: string): readonly string[] {
  return [
    `-${settings.container.kind}`, settings.container.path,
    '-scheme', settings.scheme,
    '-configuration', settings.configuration,
    '-destination', `platform=iOS Simulator,id=${udid}`,
    '-sdk', 'iphonesimulator',
    '-derivedDataPath', settings.derivedDataPath,
    'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-',
  ]
}

const buildSettingsSchema = z.array(z.object({ buildSettings: z.record(z.string(), z.unknown()) }))

/**
 * Schemes can include extensions and test bundles. Select the actual application
 * by its configured bundle identifier and resolved simulator platform.
 */
export function resolveSimulatorProduct(value: unknown, bundleId: string): string {
  const candidates = buildSettingsSchema.parse(value).filter(({ buildSettings: settings }) =>
    settings['PRODUCT_BUNDLE_IDENTIFIER'] === bundleId &&
    settings['WRAPPER_EXTENSION'] === 'app' &&
    settings['PLATFORM_NAME'] === 'iphonesimulator',
  )
  if (candidates.length !== 1) throw new Error(`Expected one simulator application product for ${bundleId}; found ${candidates.length}. Check the configured scheme.`)
  const settings = candidates[0]?.buildSettings
  const directory = settings?.['TARGET_BUILD_DIR']
  const name = settings?.['FULL_PRODUCT_NAME']
  if (typeof directory !== 'string' || !path.isAbsolute(directory) ||
      typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.app')) {
    throw new Error('Xcode returned an invalid simulator application product path')
  }
  return path.join(directory, name)
}
