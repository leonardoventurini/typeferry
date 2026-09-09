import type { PolyfillableArray } from './utils'

export const isBinary = (
  obj: unknown,
): obj is Uint8Array | PolyfillableArray => {
  return !!(
    (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||
    (Array.isArray(obj) && (obj as PolyfillableArray).$Uint8ArrayPolyfill)
  )
}
