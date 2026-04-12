import { newBinary } from './utils'

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const INVALID_CHAR = 255

const BASE64_LOOKUP = (() => {
  const lookup = new Uint8Array(256)
  lookup.fill(INVALID_CHAR)

  for (const [index, char] of [...BASE64_ALPHABET].entries()) {
    lookup[char.charCodeAt(0)] = index
  }

  // Accept URL-safe input as well.
  lookup['-'.charCodeAt(0)] = 62
  lookup['_'.charCodeAt(0)] = 63

  return lookup
})()

function getBase64Lengths(value: string): {
  validLength: number
  placeholderLength: number
} {
  if (value.length % 4 !== 0) {
    throw new Error('Invalid base64 string length')
  }

  const validLength = value.indexOf('=')
  const normalizedValidLength = validLength === -1 ? value.length : validLength
  const placeholderLength =
    normalizedValidLength === value.length ? 0 : 4 - (normalizedValidLength % 4)

  return {
    validLength: normalizedValidLength,
    placeholderLength,
  }
}

function readBase64Char(value: string, index: number): number {
  const decoded = BASE64_LOOKUP[value.charCodeAt(index)]

  if (decoded === INVALID_CHAR) {
    throw new Error('Invalid base64 character')
  }

  return decoded
}

/**
 * Encodes binary payloads for EJSON without relying on a CJS-only dependency
 * that breaks browser ESM loading in source-first consumers.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let output = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index] ?? 0
    const byte1 = bytes[index + 1] ?? 0
    const byte2 = bytes[index + 2] ?? 0
    const chunk = (byte0 << 16) | (byte1 << 8) | byte2
    const remaining = bytes.length - index

    output += BASE64_ALPHABET[(chunk >> 18) & 63]
    output += BASE64_ALPHABET[(chunk >> 12) & 63]
    output += remaining > 1 ? BASE64_ALPHABET[(chunk >> 6) & 63] : '='
    output += remaining > 2 ? BASE64_ALPHABET[chunk & 63] : '='
  }

  return output
}

/**
 * Decodes EJSON base64 payloads while preserving the legacy polyfill
 * behavior for runtimes without `Uint8Array`.
 */
export function decodeBase64(value: string): Uint8Array | ReturnType<typeof newBinary> {
  const { validLength, placeholderLength } = getBase64Lengths(value)
  const outputLength =
    ((validLength + placeholderLength) * 3) / 4 - placeholderLength
  const bytes = newBinary(outputLength)

  let byteIndex = 0
  const end = placeholderLength > 0 ? validLength - 4 : validLength
  let index = 0

  for (; index < end; index += 4) {
    const chunk =
      (readBase64Char(value, index) << 18) |
      (readBase64Char(value, index + 1) << 12) |
      (readBase64Char(value, index + 2) << 6) |
      readBase64Char(value, index + 3)

    bytes[byteIndex++] = (chunk >> 16) & 255
    bytes[byteIndex++] = (chunk >> 8) & 255
    bytes[byteIndex++] = chunk & 255
  }

  if (placeholderLength === 2) {
    const chunk =
      (readBase64Char(value, index) << 2) |
      (readBase64Char(value, index + 1) >> 4)

    bytes[byteIndex++] = chunk & 255
  }

  if (placeholderLength === 1) {
    const chunk =
      (readBase64Char(value, index) << 10) |
      (readBase64Char(value, index + 1) << 4) |
      (readBase64Char(value, index + 2) >> 2)

    bytes[byteIndex++] = (chunk >> 8) & 255
    bytes[byteIndex] = chunk & 255
  }

  return bytes
}
