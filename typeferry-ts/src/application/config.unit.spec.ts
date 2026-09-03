import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_APPLICATION_CONFIG,
  defineConfig,
  loadApplicationConfig,
  resolveApplicationConfig,
} from './config'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })),
  )
})

describe('application configuration', () => {
  it('uses conventional defaults without a configuration file', () => {
    expect(resolveApplicationConfig('/workspace/application')).toEqual({
      ...DEFAULT_APPLICATION_CONFIG,
      root: '/workspace/application',
    })
  })

  it('accepts typed high-level overrides', () => {
    const configured = defineConfig({
      development: {
        clientPort: 4100,
        serverPort: 4200,
        serverEnvironmentFile: '.env.local',
      },
      build: {
        target: 'es2024',
        sourceMaps: false,
        server: {
          external: ['sharp', '@scope/runtime/subpath'],
        },
      },
      test: {
        integration: { timeout: 45_000 },
        browser: { browser: 'firefox' },
      },
    })

    expect(
      resolveApplicationConfig('/workspace/application', configured),
    ).toMatchObject({
      development: {
        clientPort: 4100,
        serverPort: 4200,
        serverEnvironmentFile: '.env.local',
      },
      build: {
        target: 'es2024',
        sourceMaps: false,
        server: {
          external: ['sharp', '@scope/runtime/subpath'],
        },
      },
      test: {
        integration: { timeout: 45_000 },
        browser: { browser: 'firefox' },
      },
    })
  })

  it('rejects unsupported configuration fields', () => {
    expect(() =>
      resolveApplicationConfig('/workspace/application', {
        vite: { server: { port: 4100 } },
      }),
    ).toThrow(/vite/u)
  })

  it.each([
    [[''], /too_small|external/u],
    [['sharp', 'sharp'], /duplicate|external/u],
    [['./sharp'], /package specifier/u],
    [['/sharp'], /package specifier/u],
    [['sharp*'], /package specifier/u],
    [['@scope'], /package specifier/u],
  ])('rejects invalid server externals: %j', (external, expected) => {
    expect(() =>
      resolveApplicationConfig('/workspace/application', {
        build: { server: { external } },
      }),
    ).toThrow(expected)
  })

  it('accepts externals declared as direct production dependencies', async () => {
    const root = await writeApplication({
      dependencies: { sharp: '1.0.0', '@scope/runtime': '1.0.0' },
      devDependencies: {},
    })

    await writeFile(
      path.join(root, 'typeferry.config.ts'),
      "export default { build: { server: { external: ['sharp', '@scope/runtime/subpath'] } } }\n",
    )

    await expect(loadApplicationConfig(root)).resolves.toMatchObject({
      build: {
        server: { external: ['sharp', '@scope/runtime/subpath'] },
      },
    })
  })

  it.each([
    [{ dependencies: {}, devDependencies: { sharp: '1.0.0' } }, /devDependencies/u],
    [{ dependencies: {}, devDependencies: {} }, /dependencies/u],
  ])(
    'rejects externals outside direct production dependencies',
    async (manifest, expected) => {
      const root = await writeApplication(manifest)

      await writeFile(
        path.join(root, 'typeferry.config.ts'),
        "export default { build: { server: { external: ['sharp'] } } }\n",
      )

      await expect(loadApplicationConfig(root)).rejects.toThrow(expected)
    },
  )
})

async function writeApplication(manifest: {
  readonly dependencies: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeferry-config-'))
  temporaryRoots.push(root)
  await mkdir(root, { recursive: true })
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', ...manifest }),
  )
  return root
}
