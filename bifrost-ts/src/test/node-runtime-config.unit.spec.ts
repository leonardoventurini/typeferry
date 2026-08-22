import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const TYPESCRIPT_ROOT = resolve(import.meta.dirname, '../..')
const REPOSITORY_ROOT = resolve(TYPESCRIPT_ROOT, '..')
const RETIRED_RUNTIME = ['B', 'un'].join('')
const RETIRED_COMMAND = RETIRED_RUNTIME.toLowerCase()
const FORBIDDEN_FILE_NAMES = new Set([
  `${RETIRED_COMMAND}.lock`,
  `${RETIRED_COMMAND}fig.toml`,
])
const FORBIDDEN_CONTENT = [
  new RegExp(`\\b${RETIRED_RUNTIME}\\b`),
  new RegExp(`\\b${RETIRED_COMMAND}x?\\s`),
  new RegExp(`@types/${RETIRED_COMMAND}`),
  new RegExp(`${RETIRED_RUNTIME.toUpperCase()}_`),
  new RegExp(`oven/${RETIRED_COMMAND}`),
]

/** Recursively lists active files while excluding generated dependencies. */
async function listFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)))
    else files.push(entryPath)
  }
  return files
}

/** Returns retired runtime markers from active TypeScript configuration. */
async function findRetiredRuntimeMarkers(paths: string[]): Promise<string[]> {
  const violations: string[] = []
  for (const path of paths) {
    if (FORBIDDEN_FILE_NAMES.has(basename(path))) {
      violations.push(path)
      continue
    }
    const text = await readFile(path, 'utf8')
    if (FORBIDDEN_CONTENT.some(pattern => pattern.test(text))) {
      violations.push(path)
    }
  }
  return violations
}

describe('Node runtime configuration', () => {
  it('contains no retired runtime APIs, types, commands, or artifacts', async () => {
    const sourceFiles = await listFiles(resolve(TYPESCRIPT_ROOT, 'src'))
    const ownedFiles = [
      ...sourceFiles,
      resolve(TYPESCRIPT_ROOT, '.npmrc'),
      resolve(TYPESCRIPT_ROOT, '.nvmrc'),
      resolve(TYPESCRIPT_ROOT, 'eslint.config.js'),
      resolve(TYPESCRIPT_ROOT, 'package.json'),
      resolve(REPOSITORY_ROOT, 'AGENTS.md'),
      resolve(REPOSITORY_ROOT, 'RELEASING.md'),
      resolve(REPOSITORY_ROOT, '.forgejo/workflows/ci.yml'),
      resolve(REPOSITORY_ROOT, '.forgejo/workflows/release-bump.yml'),
    ].filter(path => path !== import.meta.filename)

    await expect(findRetiredRuntimeMarkers(ownedFiles)).resolves.toEqual([])
  })

  it('detects a seeded retired runtime API', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bifrost-runtime-check-'))
    const seededFile = join(directory, 'server.ts')
    await writeFile(
      seededFile,
      `${RETIRED_RUNTIME}.serve({ port: 8000 })`,
      'utf8'
    )

    try {
      await expect(findRetiredRuntimeMarkers([seededFile])).resolves.toEqual([
        seededFile,
      ])
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
