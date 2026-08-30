import { describe, expect, it } from 'vitest'

import manifest from '../../package.json'

describe('template toolchain', () => {
  it('pins the supported runtime and exposes every verification layer', () => {
    expect(manifest.engines).toEqual({ node: '24.19.0', npm: '11.17.0' })
    expect(manifest.packageManager).toBe('npm@11.17.0')
    expect(Object.keys(manifest.scripts)).toEqual(
      expect.arrayContaining([
        'lint',
        'typecheck',
        'test:browser',
        'test:integration',
        'test:unit',
      ]),
    )
  })
})
