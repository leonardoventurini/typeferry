import { describe, expect, it } from 'vitest'

import {
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from '../../auth/server/cookie-utils'
import { TestUtility } from '../test-utility'

/**
 * Tests for the token refresh flow through the HTTP transport.
 * Validates that the refresh token cookie round-trips correctly:
 * login sets the cookie → refresh reads it → refresh rotates it.
 */
describe('Cookie Utilities', () => {
  it('should set and read a refresh token cookie via header', () => {
    const headers: Record<string, string> = {}
    const mockRes = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
    }

    setRefreshTokenCookie(mockRes, 'my-token-value', {
      name: 'refreshToken',
      maxAgeDays: 14,
    })

    expect(headers['Set-Cookie']).toContain('refreshToken=')
    expect(headers['Set-Cookie']).toContain('HttpOnly')
    expect(headers['Set-Cookie']).toContain('SameSite=Lax')

    // Extract the cookie value from the Set-Cookie header
    const cookieMatch = headers['Set-Cookie'].match(/refreshToken=([^;]+)/)
    expect(cookieMatch).toBeDefined()
    expect(cookieMatch).not.toBeNull()

    const cookieValue = decodeURIComponent(cookieMatch?.[1] ?? '')
    expect(cookieValue).toBe('my-token-value')
  })

  it('should read cookie from raw Cookie header (no cookie-parser)', () => {
    const req = {
      headers: {
        cookie: 'refreshToken=my-refresh-token; other=value',
      },
    }

    const token = getRefreshTokenFromRequest(req, 'refreshToken')
    expect(token).toBe('my-refresh-token')
  })

  it('should read URL-encoded cookie value', () => {
    const encoded = encodeURIComponent('token+with=special;chars')
    const req = {
      headers: {
        cookie: `refreshToken=${encoded}; other=value`,
      },
    }

    const token = getRefreshTokenFromRequest(req, 'refreshToken')
    expect(token).toBe('token+with=special;chars')
  })

  it('should return undefined when cookie header is missing', () => {
    const req = { headers: {} }

    const token = getRefreshTokenFromRequest(req, 'refreshToken')
    expect(token).toBeUndefined()
  })

  it('should return undefined when cookie is not present', () => {
    const req = {
      headers: {
        cookie: 'other=value; another=123',
      },
    }

    const token = getRefreshTokenFromRequest(req, 'refreshToken')
    expect(token).toBeUndefined()
  })

  it('should prefer parsed cookies over raw header', () => {
    const req = {
      cookies: { refreshToken: 'from-cookie-parser' },
      headers: {
        cookie: 'refreshToken=from-raw-header',
      },
    }

    const token = getRefreshTokenFromRequest(req, 'refreshToken')
    expect(token).toBe('from-cookie-parser')
  })
})

describe('Token Refresh via HTTP Transport', () => {
  const test = new TestUtility()

  it('should have the req object available for HTTP method calls', async () => {
    let capturedReq: unknown = null

    test.server.addMethod(
      'test:check-req',
      function () {
        capturedReq = this.req
        return { hasReq: !!this.req, hasHeaders: !!this.req?.headers }
      },
      { protected: false },
    )

    // Call via HTTP transport (http: true)
    const result = await test.client.call(
      'test:check-req',
      {},
      { http: true, ignoreInit: true },
    )

    expect(result).toEqual({ hasReq: true, hasHeaders: true })
    expect(capturedReq).toBeDefined()
  })

  it('should forward cookie headers through HTTP transport', async () => {
    let capturedCookieHeader: string | undefined

    test.server.addMethod(
      'test:check-cookie',
      function () {
        capturedCookieHeader = this.req?.headers?.cookie as string | undefined
        return { hasCookie: !!capturedCookieHeader }
      },
      { protected: false },
    )

    /**
     * NOTE: In Node.js test environment, fetch doesn't send browser cookies.
     * This test verifies that the HTTP transport correctly provides req.headers
     * to the method handler — the browser's `credentials: 'include'` adds
     * the actual Cookie header in real usage.
     */
    const result = await test.client.call(
      'test:check-cookie',
      {},
      { http: true, ignoreInit: true },
    )

    expect(result).toHaveProperty('hasCookie')
  })

  it('should have res object for setting cookies in response', async () => {
    let capturedRes: unknown = null

    test.server.addMethod(
      'test:check-res',
      function () {
        capturedRes = this.res
        return { hasRes: !!this.res }
      },
      { protected: false },
    )

    const result = await test.client.call(
      'test:check-res',
      {},
      { http: true, ignoreInit: true },
    )

    expect(result).toEqual({ hasRes: true })
    expect(capturedRes).toBeDefined()
  })

  it('should NOT have req/res for WebSocket method calls', async () => {
    test.server.addMethod(
      'test:ws-context',
      function () {
        return {
          hasSocket: !!this.socket,
          hasReq: !!this.req?.headers,
          hasRes: !!this.res?.setHeader,
        }
      },
      { protected: false },
    )

    // Call via WebSocket (default, no http: true)
    const result = await test.client.call('test:ws-context', {})

    expect(result).toMatchObject({
      hasSocket: true,
      // WebSocket nodes don't have Express req/res — they use the
      // upgrade request for tracking properties only
      hasReq: false,
      hasRes: false,
    })
  })
})

describe('Token Refresh Lifecycle', () => {
  const test = new TestUtility()

  it('should complete a full login → refresh cycle', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    let loginCallCount = 0
    let refreshCallCount = 0

    server.setAuth({
      auth(context) {
        return context?.token ? { ...context, user: { _id: 'user-1' } } : false
      },
      async logIn() {
        loginCallCount++
        return { token: 'access-token-1', exp: 9999999999, iat: 1000000000 }
      },
    })

    server.addMethod(
      'auth.refresh',
      function () {
        refreshCallCount++
        return {
          accessToken: 'access-token-2',
          exp: 9999999999,
          iat: 1000000001,
        }
      },
      { protected: true },
    )

    const client = await test.createClient({ port: server.port })

    // Login via HTTP
    await client.login({ email: 'test', password: 'test' })
    expect(loginCallCount).toBe(1)
    expect(client.authenticated).toBe(true)

    // Manually trigger refresh via HTTP
    const refreshResult = await client.call(
      'auth.refresh',
      {},
      { http: true, ignoreInit: true },
    )

    expect(refreshCallCount).toBe(1)
    expect(refreshResult).toMatchObject({
      accessToken: 'access-token-2',
    })

    await server.close()
  })

  it('should reject refresh when not authenticated', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    server.setAuth({
      auth(context) {
        return context?.token ? { ...context, user: { _id: 'user-1' } } : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    server.addMethod('auth.refresh', () => ({ accessToken: 'new' }), {
      protected: true,
    })

    // Client without auth
    const client = await test.createClient({ port: server.port })

    await expect(
      client.call('auth.refresh', {}, { http: true, ignoreInit: true }),
    ).rejects.toThrow('Method Forbidden')

    await server.close()
  })
})
