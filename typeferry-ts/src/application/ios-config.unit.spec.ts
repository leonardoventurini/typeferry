import { describe, expect, it } from 'vitest'

import { parseCliArguments } from './cli-arguments'
import { resolveApplicationConfig } from './config'
import { createViteConfig } from './vite-config'

const ios = {
  runtime: 'capacitor',
  backend: { origin: 'https://example.com' },
  permissions: { camera: { purpose: 'Preview your recording.' } },
} as const
const application = { id: 'com.example.app', name: 'Example' }

describe('iOS application target', () => {
  it('requires app identity and an HTTPS backend for a packaged target', () => {
    expect(() => resolveApplicationConfig('/app', { client: { targets: { ios } } })).toThrow()
    for (const origin of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?secret=x']) {
      expect(() => resolveApplicationConfig('/app', { application, client: { targets: { ios: { ...ios, backend: { origin } } } } })).toThrow()
    }
  })

  it('builds an isolated root entry and passes the target to extensions', () => {
    const targets: string[] = []
    const config = resolveApplicationConfig('/app', {
      application,
      client: { targets: { ios } },
      extensions: { vite: (config, context) => { targets.push(context.target); return config } },
    })
    const native = createViteConfig(config, 'build', 'ios')

    expect(native.root).toBe('/app/client')
    expect(native.build?.outDir).toBe('../dist/ios-web')
    expect(native.build?.rollupOptions?.input).toBe('/app/client/index.html')
    expect(native.define?.__TYPEFERRY_RUNTIME__).toBe(JSON.stringify({ target: 'ios', backendOrigin: 'https://example.com' }))
    expect(targets).toEqual(['ios'])
  })

  it('does not allow an extension to redirect native output into server output', () => {
    const config = resolveApplicationConfig('/app', {
      application, client: { targets: { ios } },
      extensions: { vite: config => ({ ...config, build: { ...config.build, outDir: '../dist/server' } }) },
    })
    expect(() => createViteConfig(config, 'build', 'ios')).toThrow(/output/i)
  })

  it('keeps existing build syntax and selects native commands explicitly', () => {
    expect(parseCliArguments(['build'])).toEqual({ command: 'build' })
    expect(parseCliArguments(['build', '--target', 'ios'])).toEqual({ command: 'build', target: 'ios' })
    expect(parseCliArguments(['native', 'sync', 'ios'])).toEqual({ command: 'native', action: 'sync', target: 'ios' })
    expect(() => parseCliArguments(['build', '--target', 'android'])).toThrow()
  })
})
