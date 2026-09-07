import { describe, expect, it } from 'vitest'

import { resolveApplicationConfig } from './config'

function resolveIos(options: Record<string, unknown> = {}) {
  return resolveApplicationConfig('/workspace/application', {
    application: { id: 'org.example.reader', name: 'Reader' },
    client: { targets: { ios: { runtime: 'capacitor', backend: { origin: 'https://example.org' }, ...options } } },
  }).client.targets.ios
}

describe('iOS simulator configuration', () => {
  it('preserves existing targets without simulator configuration', () => {
    expect(resolveIos()).not.toHaveProperty('xcode')
    expect(resolveIos()).not.toHaveProperty('simulator')
  })

  it('normalizes supported optional Xcode and device values', () => {
    expect(resolveIos({
      xcode: { workspace: ' ios/Reader.xcworkspace ', scheme: ' Reader ', configuration: ' Debug ', derivedDataPath: ' ios/Build output ' },
      simulator: { device: ' Example phone ' },
    })).toMatchObject({
      xcode: { workspace: 'ios/Reader.xcworkspace', scheme: 'Reader', configuration: 'Debug', derivedDataPath: 'ios/Build output' },
      simulator: { device: 'Example phone' },
    })
    expect(resolveIos({ xcode: { project: 'ios/Reader.xcodeproj' } })).toHaveProperty('xcode.project', 'ios/Reader.xcodeproj')
  })

  it.each([
    { xcode: { project: 'A.xcodeproj', workspace: 'A.xcworkspace' } },
    { xcode: { project: 'A' } },
    { xcode: { workspace: 'A.xcodeproj' } },
    ...['project', 'workspace', 'scheme', 'configuration', 'derivedDataPath'].flatMap(key =>
      ['', '   ', 'bad\0value'].map(value => ({ xcode: { [key]: value } }))),
    ...['', '  ', 'bad\0device'].map(device => ({ simulator: { device } })),
    { xcode: { extraArguments: ['-allowProvisioningUpdates'] } },
    { xcode: { developmentTeam: 'EXAMPLE' } },
    { simulator: { erase: true } },
  ])('rejects invalid or unsupported options: %j', options => {
    expect(() => resolveIos(options)).toThrow()
  })
})
