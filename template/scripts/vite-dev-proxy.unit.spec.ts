import { describe, expect, it } from 'vitest'

import { isTypeFerryHttpPath, rewriteProxyHeaders } from './vite-dev-proxy'

describe('isTypeFerryHttpPath', () => {
  it('matches only the complete TypeFerry HTTP path segment', () => {
    expect(isTypeFerryHttpPath('/__h')).toBe(true)
    expect(isTypeFerryHttpPath('/__h/method')).toBe(true)
    expect(isTypeFerryHttpPath('/__health')).toBe(false)
    expect(isTypeFerryHttpPath(undefined)).toBe(false)
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
