import { describe, expect, it } from 'vitest'
import { resolveApplicationConfig } from './config'
import { resolveSimulatorProduct, resolveSimulatorSettings, simulatorBuildArguments } from './native-simulator-settings'

const application = { id: 'com.example.reader', name: 'Example' }
const ios = { runtime: 'capacitor', backend: { origin: 'https://example.com' } } as const

describe('simulator build settings', () => {
  it('resolves relative paths and retains signing without supplying a team', () => {
    const settings = resolveSimulatorSettings(resolveApplicationConfig('/example', {
      application, client: { targets: { ios: { ...ios, xcode: { workspace: 'ios/Custom.xcworkspace', scheme: 'Reader', derivedDataPath: 'output/simulator' } } } },
    }))
    const args = simulatorBuildArguments(settings, 'device-id')
    expect(args).toContain('/example/ios/Custom.xcworkspace')
    expect(args).toContain('/example/output/simulator')
    expect(args).toContain('CODE_SIGNING_ALLOWED=YES')
    expect(args).toContain('CODE_SIGN_IDENTITY=-')
    expect(args.some(argument => argument.includes('DEVELOPMENT_TEAM'))).toBe(false)
  })

  it('selects the application by identity rather than the first scheme product', () => {
    const product = (id: string, extension = 'app') => ({ buildSettings: {
      PRODUCT_BUNDLE_IDENTIFIER: id, WRAPPER_EXTENSION: extension,
      PLATFORM_NAME: 'iphonesimulator', TARGET_BUILD_DIR: '/build/Debug-iphonesimulator', FULL_PRODUCT_NAME: `Product.${extension}`,
    } })
    expect(resolveSimulatorProduct([product('com.example.tests', 'xctest'), product(application.id)], application.id)).toBe('/build/Debug-iphonesimulator/Product.app')
    expect(() => resolveSimulatorProduct([product(application.id), product(application.id)], application.id)).toThrow(/found 2/u)
    expect(() => resolveSimulatorProduct([product('com.example.other')], application.id)).toThrow(/found 0/u)
  })
})
