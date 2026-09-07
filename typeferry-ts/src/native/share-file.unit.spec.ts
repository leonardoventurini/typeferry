import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  beginFile: vi.fn(),
  appendFile: vi.fn(),
  finishFile: vi.fn(),
  cancelFile: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ registerPlugin: () => bridge }))

import { NATIVE_FILE_CHUNK_BYTES, NATIVE_FILE_MAX_BYTES, shareNativeFile } from './share-file'

beforeEach(() => {
  vi.resetAllMocks()
  bridge.beginFile.mockResolvedValue({ id: 'generated-file-id' })
  bridge.appendFile.mockResolvedValue(undefined)
  bridge.finishFile.mockResolvedValue({ completed: true })
  bridge.cancelFile.mockResolvedValue(undefined)
})

describe('native local file sharing', () => {
  it('reconstructs procedural binary data from bounded ordered chunks', async () => {
    const bytes = Uint8Array.from({ length: NATIVE_FILE_CHUNK_BYTES * 2 + 17 }, (_, index) => index % 251)
    const progress: number[] = []
    const result = await shareNativeFile(new Blob([bytes]), 'recording.webm', { onProgress: value => progress.push(value) })
    const chunks = bridge.appendFile.mock.calls.map(([chunk]) => chunk as { id: string; offset: number; base64: string })
    const reconstructed = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.base64, 'base64')))

    expect(bridge.beginFile).toHaveBeenCalledWith({ fileName: 'recording.webm', size: bytes.length })
    expect(chunks.map(chunk => chunk.offset)).toEqual([0, NATIVE_FILE_CHUNK_BYTES, NATIVE_FILE_CHUNK_BYTES * 2])
    expect(chunks.every(chunk => chunk.base64.length <= 65_536)).toBe(true)
    expect(reconstructed).toEqual(Buffer.from(bytes))
    expect(progress).toEqual([NATIVE_FILE_CHUNK_BYTES, NATIVE_FILE_CHUNK_BYTES * 2, bytes.length])
    expect(bridge.finishFile).toHaveBeenCalledWith({ id: 'generated-file-id' })
    expect(bridge.cancelFile).not.toHaveBeenCalled()
    expect(result).toEqual({ completed: true })
  })

  it('rejects oversized files before starting native work', async () => {
    const file = new Blob([])
    Object.defineProperty(file, 'size', { value: NATIVE_FILE_MAX_BYTES + 1 })

    await expect(shareNativeFile(file, 'large.webm')).rejects.toThrow('128 MiB')
    expect(bridge.beginFile).not.toHaveBeenCalled()
  })

  it('cleans up a partial native file when appending fails', async () => {
    bridge.appendFile.mockRejectedValue(new Error('Disk full'))

    await expect(shareNativeFile(new Blob(['recording']), 'take.webm')).rejects.toThrow('Disk full')
    expect(bridge.cancelFile).toHaveBeenCalledWith({ id: 'generated-file-id' })
    expect(bridge.finishFile).not.toHaveBeenCalled()
  })

  it('cancels native staging when aborted between chunks', async () => {
    const controller = new AbortController()
    bridge.appendFile.mockImplementation(async () => controller.abort())
    const file = new Blob([new Uint8Array(NATIVE_FILE_CHUNK_BYTES * 2)])

    await expect(shareNativeFile(file, 'take.webm', { signal: controller.signal })).rejects.toThrow('aborted')
    expect(bridge.appendFile).toHaveBeenCalledTimes(1)
    expect(bridge.cancelFile).toHaveBeenCalledWith({ id: 'generated-file-id' })
  })

  it('leaves cancellation of the share sheet as a normal result', async () => {
    bridge.finishFile.mockResolvedValue({ completed: false })

    await expect(shareNativeFile(new Blob([]), 'empty.txt')).resolves.toEqual({ completed: false })
    expect(bridge.appendFile).not.toHaveBeenCalled()
    expect(bridge.cancelFile).not.toHaveBeenCalled()
  })
})
