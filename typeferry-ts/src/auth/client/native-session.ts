import type { HttpFetch } from '../../client/backend-origin'
import { resolveBackendOrigins } from '../../client/backend-origin'

/**
 * Public access context returned by the application exchange endpoint.
 * The refresh credential stays in the native HTTP cookie store.
 */
export interface NativeAccessSession {
  token: string
  exp: number
  iat: number
}

/**
 * An external system-browser handoff and its application-owned endpoints.
 * httpFetch must use the same private native cookie store as the RPC client.
 */
export interface NativeSessionOptions {
  backendOrigin: string
  authorizationPath: string
  exchangePath: string
  redirectUri: string
  authenticate(options: { url: string; callbackScheme: string }): Promise<{ url: string }>
  httpFetch: HttpFetch
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function endpoint(path: string, origin: string): URL {
  const url = new URL(path, origin)

  if (url.origin !== origin || url.username || url.password || url.hash) {
    throw new Error('Native authentication endpoint must use the backend origin')
  }

  return url
}

function readCallback(value: string, expected: URL, state: string): string {
  const callback = new URL(value)
  const codes = callback.searchParams.getAll('code')
  const states = callback.searchParams.getAll('state')
  const code = codes[0]
  const callbackState = states[0]

  if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname || callback.username || callback.password || callback.hash || codes.length !== 1 || states.length !== 1 || callbackState !== state || code === undefined || !/^[A-Za-z0-9_-]{43}$/.test(code) || callback.searchParams.has('error')) {
    throw new Error('Invalid native authentication callback')
  }

  return code
}

function isAccessSession(value: unknown): value is NativeAccessSession {
  if (typeof value !== 'object' || value === null) return false

  return 'token' in value && typeof value.token === 'string' && value.token.length > 0
    && 'exp' in value && typeof value.exp === 'number' && Number.isFinite(value.exp)
    && 'iat' in value && typeof value.iat === 'number' && Number.isFinite(value.iat)
    && value.exp > value.iat
}

/**
 * Authenticates in an external browser with PKCE S256 and a fresh state value.
 * Exchanges the returned code through native HTTP to establish its private
 * refresh cookie. The caller installs the returned access context on its Client.
 * No refresh credential or PKCE verifier is placed in a callback URL.
 */
export async function authenticateNativeSession(options: NativeSessionOptions): Promise<NativeAccessSession> {
  const origin = resolveBackendOrigins({ httpOrigin: options.backendOrigin }).httpOrigin
  const authorization = endpoint(options.authorizationPath, origin)
  const exchange = endpoint(options.exchangePath, origin)
  const redirect = new URL(options.redirectUri)

  if (!redirect.protocol.includes('.') || redirect.username || redirect.password || redirect.search || redirect.hash) {
    throw new Error('Native redirect URI must use a reverse-domain app scheme without credentials, query or fragment')
  }

  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))

  authorization.searchParams.set('redirect_uri', options.redirectUri)
  authorization.searchParams.set('code_challenge', base64Url(new Uint8Array(digest)))
  authorization.searchParams.set('code_challenge_method', 'S256')
  authorization.searchParams.set('state', state)

  const callback = await options.authenticate({ url: authorization.href, callbackScheme: redirect.protocol.slice(0, -1) })
  const code = readCallback(callback.url, redirect, state)
  const response = await options.httpFetch(exchange.href, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: options.redirectUri }),
  })

  if (!response.ok) throw new Error(`Native authentication exchange failed (${response.status})`)

  const result: unknown = await response.json()

  if (!isAccessSession(result)) throw new Error('Invalid native access session')

  return { token: result.token, exp: result.exp, iat: result.iat }
}
