import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import * as testApi from '../testing'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const TOOL_IMPORT_PATTERN =
  /from ['"](?:vite|vitest|vitest\/node|esbuild|jiti|tree-kill|@vitejs\/|@vitest\/|@tailwindcss\/|@rollup\/plugin-babel)/u

describe('application package contract', () => {
  it('publishes the CLI and additive application exports', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as {
      readonly bin?: Record<string, string>
      readonly exports?: Record<string, unknown>
    }

    expect(manifest.bin?.['typeferry']).toBe('./dist/cli/index.js')
    expect(manifest.exports).toHaveProperty('./config')
    expect(manifest.exports).toHaveProperty('./test')
  })

  it('mirrors the installed Vitest API', () => {
    expect(testApi.describe).toBeTypeOf('function')
    expect(testApi.expect).toBeTypeOf('function')
    expect(testApi.vi).toBeTypeOf('object')
  })

  it('keeps application tooling out of existing runtime source', async () => {
    const sourceFiles = await collectSourceFiles(path.join(PACKAGE_ROOT, 'src'))
    const runtimeFiles = sourceFiles.filter(
      file =>
        !file.includes('/application/') &&
        !file.includes('/cli/') &&
        !file.includes('/test/') &&
        !file.includes('/testing/') &&
        !/\.(?:(?:unit|integration|browser)\.spec|test)\.tsx?$/u.test(file),
    )

    const violations: string[] = []
    for (const file of runtimeFiles) {
      const source = await readFile(file, 'utf8')
      if (TOOL_IMPORT_PATTERN.test(source)) {
        violations.push(path.relative(PACKAGE_ROOT, file))
      }
    }

    expect(violations).toEqual([])
  })
})

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(entryPath)
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
        ? [entryPath]
        : []
    }),
  )

  return files.flat()
}
