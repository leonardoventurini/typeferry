import { describe, expect, it } from 'vitest'

import { decodeBase64, encodeBase64 } from './base64'

describe('base64 helpers', () => {
  it('encodes and decodes binary payloads losslessly', () => {
    const input = new Uint8Array([10, 20, 30, 40, 50, 60])

    const encoded = encodeBase64(input)
    const decoded = decodeBase64(encoded)

    expect(encoded).toBe('ChQeKDI8')
    expect(decoded).toEqual(input)
  })

  it('handles padded output for trailing bytes', () => {
    expect(encodeBase64(new Uint8Array([255]))).toBe('/w==')
    expect(encodeBase64(new Uint8Array([255, 238]))).toBe('/+4=')
  })

  it('accepts url-safe base64 input during decode', () => {
    const decoded = decodeBase64('-_8=')

    expect(decoded).toEqual(new Uint8Array([251, 255]))
  })
})
