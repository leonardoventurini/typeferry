import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { authenticateNativeSession } from './native-session'

function fixture(tamper?: (callback: URL) => void) {
  const httpFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'access-token', exp: 2_000, iat: 1_000 })))
  const authenticate = vi.fn(async ({ url }: { url: string; callbackScheme: string }) => {
    const authorization = new URL(url)
    const callback = new URL(authorization.searchParams.get('redirect_uri') ?? '')

    callback.searchParams.set('code', 'a'.repeat(43))
    callback.searchParams.set('state', authorization.searchParams.get('state') ?? '')
    tamper?.(callback)

    return { url: callback.href }
  })
  const options = {
    backendOrigin: 'https://api.example.test',
    authorizationPath: '/native/authorize',
    exchangePath: '/native/exchange',
    redirectUri: 'com.example.app://auth/callback',
    authenticate,
    httpFetch,
  }

  return { options, httpFetch, authenticate }
}

describe('native browser authentication', () => {
  it('uses S256 and exchanges a matching callback through native HTTP', async () => {
    const { options, authenticate, httpFetch } = fixture()

    expect(await authenticateNativeSession(options)).toEqual({ token: 'access-token', exp: 2_000, iat: 1_000 })
    const authorization = new URL(authenticate.mock.calls[0]![0].url)
    const body = JSON.parse(httpFetch.mock.calls[0]![1].body as string) as { code: string; codeVerifier: string; redirectUri: string }

    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('code_challenge')).toBe(createHash('sha256').update(body.codeVerifier).digest('base64url'))
    expect(authorization.searchParams.has('code_verifier')).toBe(false)
    expect(body.redirectUri).toBe(options.redirectUri)
    expect(httpFetch).toHaveBeenCalledWith('https://api.example.test/native/exchange', expect.objectContaining({ credentials: 'include', method: 'POST' }))
  })

  it.each([
    (url: URL) => { url.searchParams.set('state', 'attacker') },
    (url: URL) => { url.hostname = 'other' },
    (url: URL) => { url.pathname = '/other' },
    (url: URL) => { url.searchParams.append('code', 'b'.repeat(43)) },
    (url: URL) => { url.hash = 'token=secret' },
  ])('rejects tampered callbacks before exchange', async tamper => {
    const { options, httpFetch } = fixture(tamper)

    await expect(authenticateNativeSession(options)).rejects.toThrow('Invalid native authentication callback')
    expect(httpFetch).not.toHaveBeenCalled()
  })

  it('rejects cross-origin authorization or exchange endpoints before opening browser', async () => {
    const { options, authenticate } = fixture()

    await expect(authenticateNativeSession({ ...options, exchangePath: 'https://attacker.test/exchange' })).rejects.toThrow('Native authentication endpoint must use the backend origin')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('does not expose response bodies containing credentials in errors', async () => {
    const { options, httpFetch } = fixture()
    httpFetch.mockResolvedValue(new Response('secret-refresh', { status: 401 }))

    await expect(authenticateNativeSession(options)).rejects.toThrow('Native authentication exchange failed (401)')
  })
})
