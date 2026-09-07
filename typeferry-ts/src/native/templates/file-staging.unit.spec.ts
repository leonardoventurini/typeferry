import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { FILE_STAGING_SWIFT } from './file-staging'

describe.runIf(process.platform === 'darwin')('native file staging', () => {
  it('writes exact bounded chunks and rejects invalid offsets, sizes and names', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'typeferry-file-staging-'))
    const file = join(directory, 'main.swift')
    const source = FILE_STAGING_SWIFT + String.raw`
func rejects(_ action: () throws -> Void) {
    do { try action(); fatalError("Expected rejection") } catch { /* Expected invalid input. */ }
}
let staging = TypeFerryFileStaging()
rejects { _ = try staging.begin(fileName: "../escape", size: 1) }
rejects { _ = try staging.begin(fileName: "large", size: TypeFerryFileStaging.maximumBytes + 1) }
let bytes = Data((0..<(TypeFerryFileStaging.chunkBytes + 17)).map { UInt8($0 % 251) })
let id = try staging.begin(fileName: "generated.webm", size: bytes.count)
rejects { _ = try staging.begin(fileName: "concurrent", size: 1) }
rejects { try staging.append(id: id, offset: 1, base64: Data([1]).base64EncodedString()) }
rejects { try staging.append(id: id, offset: 0, base64: bytes.base64EncodedString()) }
rejects { _ = try staging.finish(id: id) }
try staging.append(id: id, offset: 0, base64: bytes.prefix(TypeFerryFileStaging.chunkBytes).base64EncodedString())
rejects { try staging.append(id: id, offset: 0, base64: Data([1]).base64EncodedString()) }
try staging.append(id: id, offset: TypeFerryFileStaging.chunkBytes, base64: bytes.suffix(17).base64EncodedString())
let completed = try staging.finish(id: id)
let output = try Data(contentsOf: completed.url)
assert(output == bytes)
try FileManager.default.removeItem(at: completed.url)
let canceled = try staging.begin(fileName: "canceled", size: 1)
staging.cancel(id: "stale-id")
assert(staging.contains(id: canceled))
staging.cancel(id: canceled)
assert(!staging.contains(id: canceled))
rejects { _ = try staging.finish(id: canceled) }
let empty = try staging.begin(fileName: "empty.txt", size: 0)
let emptyFile = try staging.finish(id: empty)
let emptyOutput = try Data(contentsOf: emptyFile.url)
assert(emptyOutput.isEmpty)
try FileManager.default.removeItem(at: emptyFile.url)
`

    try {
      await writeFile(file, source)
      execFileSync('swift', [file], { timeout: 30_000, stdio: 'pipe' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 40_000)
})
