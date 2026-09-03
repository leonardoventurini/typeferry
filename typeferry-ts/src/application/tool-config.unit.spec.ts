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
    expect(createServerBuildOptions(config).external).toEqual([])
  })

  it('externalizes configured server runtime packages', () => {
    const configured = resolveApplicationConfig(ROOT, {
      build: {
        server: {
          external: ['sharp', '@scope/runtime/subpath'],
        },
      },
    })

    expect(createServerBuildOptions(configured).external).toEqual([
      'sharp',
      '@scope/runtime/subpath',
    ])
  })

  it('creates named unit, integration, and browser projects', () => {
    const testConfig = createTestConfig(config)
    const projects = testConfig.test?.projects

    expect(projects).toHaveLength(3)
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          test: expect.objectContaining({
            name: 'unit',
            fileParallelism: false,
            env: { NODE_ENV: 'test' },
          }),
        }),
        expect.objectContaining({
          test: expect.objectContaining({
            name: 'integration',
            fileParallelism: false,
          }),
        }),
        expect.objectContaining({
          test: expect.objectContaining({ name: 'browser', fileParallelism: false }),
        }),
      ]),
    )
  })

  it('applies typed application extensions after framework defaults', () => {
    const extended = resolveApplicationConfig(ROOT, {
      extensions: {
        vite: viteConfig => ({
          ...viteConfig,
          define: { __APPLICATION__: JSON.stringify(true) },
        }),
        serverBuild: buildOptions => ({
          ...buildOptions,
          external: ['mongodb'],
        }),
        test: testConfig => ({
          ...testConfig,
          test: { ...testConfig.test, testTimeout: 12_000 },
        }),
      },
    })

    expect(createViteConfig(extended, 'build').define).toEqual({
      __APPLICATION__: 'true',
    })
    expect(createServerBuildOptions(extended).external).toEqual(['mongodb'])
    expect(createTestConfig(extended).test?.testTimeout).toBe(12_000)
  })
})
