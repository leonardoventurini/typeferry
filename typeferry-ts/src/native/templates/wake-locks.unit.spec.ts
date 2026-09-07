import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { WAKE_LOCKS_SWIFT } from './wake-locks'

describe.runIf(process.platform === 'darwin')('native wake lock ownership', () => {
  it('keeps foreground leases isolated and cleans navigation ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'typeferry-wake-locks-'))
    const file = join(directory, 'main.swift')
    const source = WAKE_LOCKS_SWIFT + String.raw`
var changes: [Bool] = []
let locks = TypeFerryWakeLocks { changes.append($0) }
locks.setActive(owner: "first", active: true)
let first = locks.acquire(owner: "first")
let second = locks.acquire(owner: "first")
assert(changes == [true])
locks.release(id: first, owner: "other")
assert(changes == [true])
locks.setActive(owner: "first", active: false)
assert(changes == [true, false])
locks.setActive(owner: "first", active: true)
assert(changes == [true, false, true])
locks.release(id: first, owner: "first")
assert(changes == [true, false, true])
locks.setActive(owner: "other", active: true)
let third = locks.acquire(owner: "other")
locks.removeOwner("first")
assert(changes == [true, false, true])
locks.release(id: third, owner: "other")
assert(changes == [true, false, true, false])
locks.release(id: second, owner: "first")
assert(changes == [true, false, true, false])
`
    try {
      await writeFile(file, source)
      execFileSync('swift', [file], { timeout: 30_000, stdio: 'pipe' })
    } finally { await rm(directory, { recursive: true, force: true }) }
  }, 40_000)
})
