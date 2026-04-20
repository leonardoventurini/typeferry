import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CookieOptions } from '../types'
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from './cookie-utils'

function makeResponse() {
  const headers: Record<string, string> = {}
  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value
    }),
    headers,
  }
}

function makeOptions(overrides: Partial<CookieOptions> = {}): CookieOptions {
  return {
    name: 'refresh_token',
    maxAgeDays: 14,
    ...overrides,
  }
}

describe('setRefreshTokenCookie', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('sets Set-Cookie header with HttpOnly, Path, Max-Age, and SameSite', () => {
    const res = makeResponse()
    const options = makeOptions()

    setRefreshTokenCookie(res, 'my-token-value', options)

    expect(res.setHeader).toHaveBeenCalledOnce()
    const [headerName, headerValue] = res.setHeader.mock.calls[0]
    expect(headerName).toBe('Set-Cookie')
    expect(headerValue).toContain('refresh_token=my-token-value')
    expect(headerValue).toContain('HttpOnly')
    expect(headerValue).toContain('Path=/')
    expect(headerValue).toContain(`Max-Age=${14 * 24 * 60 * 60}`)
    expect(headerValue).toContain('SameSite=Lax')
  })

  it('defaults SameSite to Lax', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions())

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('SameSite=Lax')
  })

  it('respects custom SameSite option', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions({ sameSite: 'Strict' }))

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('SameSite=Strict')
  })

  it('respects custom path option', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions({ path: '/api/auth' }))

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Path=/api/auth')
  })

  it('adds Secure flag when secure option is true', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions({ secure: true }))

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Secure')
  })

  it('omits Secure flag when secure option is false', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions({ secure: false }))

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).not.toContain('Secure')
  })

  it('adds Secure flag in production when secure is not explicitly set', () => {
    process.env.NODE_ENV = 'production'
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions())

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Secure')
  })

  it('omits Secure flag in development when secure is not explicitly set', () => {
    process.env.NODE_ENV = 'development'
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions())

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).not.toContain('Secure')
  })

  it('URL-encodes special characters in token value', () => {
    const res = makeResponse()
    const tokenWithSpecials = 'token;with=special&chars'
    setRefreshTokenCookie(res, tokenWithSpecials, makeOptions())

    const headerValue = res.setHeader.mock.calls[0][1] as string
    expect(headerValue).toContain(
      `refresh_token=${encodeURIComponent(tokenWithSpecials)}`,
    )
    // Should not contain raw semicolons in the token part
    expect(headerValue.split('=')[1].split(';')[0]).not.toContain(';')
  })

  it('calculates Max-Age from maxAgeDays correctly', () => {
    const res = makeResponse()
    setRefreshTokenCookie(res, 'token', makeOptions({ maxAgeDays: 7 }))

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain(`Max-Age=${7 * 24 * 60 * 60}`)
  })
})

describe('clearRefreshTokenCookie', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('sets Max-Age=0 to expire the cookie immediately', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token' })

    const [headerName, headerValue] = res.setHeader.mock.calls[0]
    expect(headerName).toBe('Set-Cookie')
    expect(headerValue).toContain('Max-Age=0')
  })

  it('sets the cookie name with empty value', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token' })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('refresh_token=;')
  })

  it('includes HttpOnly and SameSite=Lax', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token' })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('HttpOnly')
    expect(headerValue).toContain('SameSite=Lax')
  })

  it('adds Secure flag in production', () => {
    process.env.NODE_ENV = 'production'
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token' })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Secure')
  })

  it('omits Secure flag when explicitly set to false', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token', secure: false })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).not.toContain('Secure')
  })

  it('defaults path to /', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token' })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Path=/')
  })

  it('respects custom path', () => {
    const res = makeResponse()
    clearRefreshTokenCookie(res, { name: 'refresh_token', path: '/auth' })

    const headerValue = res.setHeader.mock.calls[0][1]
    expect(headerValue).toContain('Path=/auth')
  })
})

describe('getRefreshTokenFromRequest', () => {
  it('reads from parsed cookies object first', () => {
    const req = {
      cookies: { refresh_token: 'from-cookies-object' },
      headers: { cookie: 'refresh_token=from-header' },
    }

    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe('from-cookies-object')
  })

  it('falls back to parsing cookie header when cookies object is missing', () => {
    const req = {
      headers: { cookie: 'refresh_token=header-token-value' },
    }

    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe('header-token-value')
  })

  it('falls back to parsing cookie header when cookie name is not in cookies object', () => {
    const req = {
      cookies: { other_cookie: 'some-value' },
      headers: { cookie: 'refresh_token=header-fallback' },
    }

    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe('header-fallback')
  })

  it('parses cookie from header among multiple cookies', () => {
    const req = {
      headers: {
        cookie: 'session=abc; refresh_token=target-value; theme=dark',
      },
    }

    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe('target-value')
  })

  it('URL-decodes values from cookie header', () => {
    const originalValue = 'token;with=special&chars'
    const encoded = encodeURIComponent(originalValue)
    const req = {
      headers: { cookie: `refresh_token=${encoded}` },
    }

    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe(originalValue)
  })

  it('returns undefined when no cookies are available', () => {
    const req = { headers: {} }
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBeUndefined()
  })

  it('returns undefined when cookies object is empty and no cookie header', () => {
    const req = { cookies: {}, headers: {} }
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBeUndefined()
  })

  it('returns undefined when cookie name is not found in header', () => {
    const req = {
      headers: { cookie: 'session=abc; theme=dark' },
    }
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBeUndefined()
  })

  it('returns undefined when headers object is missing', () => {
    const req = {}
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBeUndefined()
  })

  it('handles cookie as the first entry in the header', () => {
    const req = {
      headers: { cookie: 'refresh_token=first-cookie; other=val' },
    }
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBe('first-cookie')
  })

  it('handles cookie as the only entry in the header', () => {
    const req = {
      headers: { cookie: 'refresh_token=solo-cookie' },
    }
    expect(getRefreshTokenFromRequest(req, 'refresh_token')).toBe('solo-cookie')
  })

  it('returns raw value when URL decoding fails', () => {
    const req = {
      headers: { cookie: 'refresh_token=%E0%A4%A' },
    }
    // Malformed percent-encoding should return raw value
    const result = getRefreshTokenFromRequest(req, 'refresh_token')
    expect(result).toBe('%E0%A4%A')
  })

  it('handles cookie names with regex special characters', () => {
    const req = {
      headers: { cookie: 'my.cookie[0]=value123; other=x' },
    }
    const result = getRefreshTokenFromRequest(req, 'my.cookie[0]')
    expect(result).toBe('value123')
  })
})
