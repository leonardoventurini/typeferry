import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { MEDIA_PERMISSION_POLICY_SWIFT } from './media-permission-policy'

describe.runIf(process.platform === 'darwin')('native media trust policy', () => {
  it('accepts only the configured local origin and main frame', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'typeferry-media-policy-'))
    const file = join(directory, 'main.swift')
    const cases = [
      ['capacitor://localhost', 'capacitor://localhost', true, true],
      ['capacitor://localhost', 'capacitor://localhost/path', true, true],
      ['capacitor://localhost', 'capacitor://localhost', false, false],
      ['capacitor://localhost', 'https://localhost', true, false],
      ['capacitor://localhost', 'capacitor://localhost.attacker.test', true, false],
      ['capacitor://localhost', 'capacitor://localhost:443', true, false],
      ['capacitor://localhost', 'capacitor://user@localhost', true, false],
      ['https://example.test', 'https://example.test:443', true, true],
    ] as const
    const assertions = cases.map(([local, request, main, expected]) =>
      `assert(TypeFerryMediaPolicy.isTrusted(localURL: URL(string: "${local}")!, requestURL: URL(string: "${request}")!, isMainFrame: ${main}) == ${expected})`,
    ).join('\n')

    try {
      await writeFile(file, `${MEDIA_PERMISSION_POLICY_SWIFT}\n${assertions}\n`)
      execFileSync('swift', [file], { timeout: 30_000, stdio: 'pipe' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 40_000)
})
