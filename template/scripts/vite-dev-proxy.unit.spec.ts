import { describe, expect, it } from 'vitest'

import { isBifrostHttpPath, rewriteProxyHeaders } from './vite-dev-proxy'

describe('isBifrostHttpPath', () => {
  it('matches only the complete Bifrost HTTP path segment', () => {
    expect(isBifrostHttpPath('/__h')).toBe(true)
    expect(isBifrostHttpPath('/__h/method')).toBe(true)
    expect(isBifrostHttpPath('/__health')).toBe(false)
    expect(isBifrostHttpPath(undefined)).toBe(false)
  })
})

describe('rewriteProxyHeaders', () => {
  it('does not create an undefined set-cookie header', () => {
    expect(rewriteProxyHeaders({ 'content-type': 'application/json' })).toEqual(
      { 'content-type': 'application/json' },
    )
  })

  it('removes backend cookie domains for the browser-facing origin', () => {
    expect(
      rewriteProxyHeaders({
        'set-cookie': ['session=value; Domain=localhost; HttpOnly'],
      }),
    ).toEqual({ 'set-cookie': ['session=value; HttpOnly'] })
  })
})
