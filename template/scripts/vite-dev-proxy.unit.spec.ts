import { describe, expect, it } from 'vitest'

import { isBifrostHttpPath } from './vite-dev-proxy'

describe('isBifrostHttpPath', () => {
  it('matches only the complete Bifrost HTTP path segment', () => {
    expect(isBifrostHttpPath('/__h')).toBe(true)
    expect(isBifrostHttpPath('/__h/method')).toBe(true)
    expect(isBifrostHttpPath('/__health')).toBe(false)
    expect(isBifrostHttpPath(undefined)).toBe(false)
  })
})
