import { describe, expect, it } from 'vitest'

import { resolveApplicationConfig } from './config'
import { createServerBuildOptions } from './server-build'
import { createTestConfig } from './test-config'
import { createViteConfig } from './vite-config'

const ROOT = '/workspace/application'

describe('application tool configuration', () => {
  const config = resolveApplicationConfig(ROOT)

  it('creates the conventional Vite configuration', () => {
    const viteConfig = createViteConfig(config, 'build')

    expect(viteConfig.configFile).toBe(false)
    expect(viteConfig.root).toBe(`${ROOT}/client`)
    expect(viteConfig.build).toMatchObject({
      outDir: '../dist/client',
      manifest: true,
      target: 'es2023',
    })
  })

  it('creates the conventional bundled server options', () => {
    expect(createServerBuildOptions(config)).toMatchObject({
      bundle: true,
      entryPoints: [`${ROOT}/server/index.ts`],
      format: 'cjs',
      outfile: `${ROOT}/dist/server/index.cjs`,
      platform: 'node',
      sourcemap: true,
    })
  })

  it('creates named unit, integration, and browser projects', () => {
    const testConfig = createTestConfig(config)
    const projects = testConfig.test?.projects

    expect(projects).toHaveLength(3)
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ test: expect.objectContaining({ name: 'unit' }) }),
        expect.objectContaining({
          test: expect.objectContaining({ name: 'integration' }),
        }),
        expect.objectContaining({
          test: expect.objectContaining({ name: 'browser' }),
        }),
      ]),
    )
  })
})
