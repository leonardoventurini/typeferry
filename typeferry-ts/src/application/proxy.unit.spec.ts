import { describe, expect, it } from 'vitest'

import { isTypeFerryHttpPath, rewriteProxyHeaders } from './proxy'

describe('TypeFerry development proxy', () => {
  it('matches only TypeFerry HTTP endpoints', () => {
    expect(isTypeFerryHttpPath('/__h')).toBe(true)
    expect(isTypeFerryHttpPath('/__h/messages.list')).toBe(true)
    expect(isTypeFerryHttpPath('/healthz')).toBe(false)
  })

  it('removes backend-only cookie domains', () => {
    expect(
      rewriteProxyHeaders({
        'set-cookie': ['session=value; Domain=localhost; HttpOnly'],
      }),
    ).toEqual({
      'set-cookie': ['session=value; HttpOnly'],
    })
  })
})
