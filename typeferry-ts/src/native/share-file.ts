import { TypeFerryNative } from './index'

export const NATIVE_FILE_MAX_BYTES = 128 * 1024 * 1024
export const NATIVE_FILE_CHUNK_BYTES = 48 * 1024
const ENCODING_BLOCK_BYTES = 8192

export interface ShareNativeFileOptions {
  signal?: AbortSignal
  /**
   * Reports bytes staged on device; completion still requires the share sheet.
   */
  onProgress?: (bytes: number) => void
}

function encode(bytes: Uint8Array): string {
  const blocks: string[] = []

  for (let index = 0; index < bytes.length; index += ENCODING_BLOCK_BYTES) {
    blocks.push(String.fromCharCode(...bytes.subarray(index, index + ENCODING_BLOCK_BYTES)))
  }

  return btoa(blocks.join(''))
}

/**
 * Shares a local Blob without passing its entire contents over the native bridge.
 * Native staging validates every offset and removes partial files after failure.
 * Cancellation applies during staging; once presented, the system share sheet
 * owns cancellation and returns completed=false when dismissed.
 */
export async function shareNativeFile(file: Blob, fileName: string, options: ShareNativeFileOptions = {}): Promise<{ completed: boolean }> {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > NATIVE_FILE_MAX_BYTES) {
    throw new Error('Native file sharing supports files up to 128 MiB.')
  }

  options.signal?.throwIfAborted()

  const { id } = await TypeFerryNative.beginFile({ fileName, size: file.size })

  try {
    for (let offset = 0; offset < file.size; offset += NATIVE_FILE_CHUNK_BYTES) {
      options.signal?.throwIfAborted()

      const bytes = new Uint8Array(await file.slice(offset, offset + NATIVE_FILE_CHUNK_BYTES).arrayBuffer())

      options.signal?.throwIfAborted()
      await TypeFerryNative.appendFile({ id, offset, base64: encode(bytes) })
      options.onProgress?.(offset + bytes.length)
    }

    options.signal?.throwIfAborted()

    return await TypeFerryNative.finishFile({ id })
  } catch (error) {
    // Cleanup failure must not hide the original failure; native staging also expires.
    await TypeFerryNative.cancelFile({ id }).catch(() => undefined)
    throw error
  }
}
