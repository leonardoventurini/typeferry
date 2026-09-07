import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { registerNativeSource, writeGeneratedFile } from './native-project'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))) })

describe('native project ownership', () => {
  it('updates generated content but refuses to overwrite user modifications', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'typeferry-native-'))
    roots.push(root)
    await writeGeneratedFile(root, 'generated.swift', 'first')
    await writeGeneratedFile(root, 'generated.swift', 'second')
    await writeFile(path.join(root, 'generated.swift'), 'custom')
    await expect(writeGeneratedFile(root, 'generated.swift', 'third')).rejects.toThrow(/overwrite/)
    expect(await readFile(path.join(root, 'generated.swift'), 'utf8')).toBe('custom')
  })

  it('registers source once without replacing app project settings', () => {
    const project = [
      '/* Begin PBXBuildFile section */', '/* Begin PBXFileReference section */',
      '\tABC /* AppDelegate.swift */,', '\tDEF /* AppDelegate.swift in Sources */,',
      'DEVELOPMENT_TEAM = existing;',
    ].join('\n')
    const registered = registerNativeSource(project)
    expect(registerNativeSource(registered)).toBe(registered)
    expect(registered).toContain('DEVELOPMENT_TEAM = existing;')
    expect(() => registerNativeSource('unrecognized')).toThrow(/Unsupported/)
  })
})
