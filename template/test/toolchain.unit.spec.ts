import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import manifest from '../package.json'
import tsconfig from '../tsconfig.json'

const templateRoot = new URL('../', import.meta.url)

const readTemplateFile = (path: string): string => {
  // Paths are restricted to the fixed, repository-owned allowlist in this test.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFileSync(new URL(path, templateRoot), 'utf8')
}

const architectureFiles = import.meta.glob([
  '../client/**/*',
  '../common/**/*',
  '../server/**/*',
  '../test/**/*',
])
const legacySourceFiles = import.meta.glob('../src/**/*')

describe('template toolchain', () => {
  it('pins the supported runtime and exposes every verification layer', () => {
    expect(manifest.engines).toEqual({ node: '26.5.1', npm: '11.17.0' })
    expect(manifest.packageManager).toBe('npm@11.17.0')

    const miseConfig = readTemplateFile('.mise.toml')
    expect(miseConfig).toContain('node = "26.5.1"')
    expect(miseConfig).not.toMatch(/^npm\s*=/mu)

    for (const dockerfile of ['Dockerfile', 'Dockerfile.development']) {
      const contents = readTemplateFile(dockerfile)
      expect(contents, dockerfile).toContain('node:26.5.1-bookworm-slim')
      expect(contents, dockerfile).not.toContain('npm install --global')
    }

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

  it('uses the root-level architecture paths consistently', () => {
    expect(tsconfig.compilerOptions.paths).toEqual({ '@/*': ['*'] })
    expect(tsconfig.include).toEqual(
      expect.arrayContaining([
        'client/**/*.ts',
        'client/**/*.tsx',
        'common/**/*.ts',
        'server/**/*.ts',
        'test/**/*.ts',
      ]),
    )

    const pathSensitiveFiles = [
      'develop.ts',
      'eslint.config.ts',
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.browser.ts',
      'vitest.config.integration.ts',
      'vitest.config.unit.ts',
    ]

    for (const path of pathSensitiveFiles) {
      expect(readTemplateFile(path), path).not.toMatch(/\bsrc\//u)
    }

    expect(Object.keys(architectureFiles)).toEqual(
      expect.arrayContaining([
        '../client/app.tsx',
        '../common/messages.ts',
        '../server/index.ts',
        './setup-unit.ts',
      ]),
    )
    expect(Object.keys(legacySourceFiles)).toHaveLength(0)
  })
})
