import { createHash, randomBytes } from 'node:crypto'

const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/
const GRANT_LIFETIME_MS = 120_000

/**
 * Application-owned identity intent, bound to one native authorization attempt.
 * Store the hash, never the plaintext authorization code or a refresh token.
 */
export interface NativeAuthGrant<T> {
  codeHash: string
  challenge: string
  redirectUri: string
  expiresAt: number
  value: T
}

/**
 * Atomic consume predicate. All fields must match and expiresAt must exceed now.
 */
export interface NativeAuthGrantConsume {
  codeHash: string
  challenge: string
  redirectUri: string
  now: number
}

/**
 * Durable shared storage contract for deployments with multiple server processes.
 * consume must atomically delete and return only a grant matching every predicate;
 * failed verification must leave the valid grant intact. Purge expired grants.
 */
export interface NativeAuthGrantStore<T> {
  create(grant: NativeAuthGrant<T>): Promise<void>
  consume(request: NativeAuthGrantConsume): Promise<T | null>
}

/**
 * Server integration for an application-authenticated browser-to-native handoff.
 */
export interface NativeAuthHandoffOptions<T> {
  store: NativeAuthGrantStore<T>
  redirectUris: readonly string[]
  now?: () => number
}

/**
 * Issues short-lived, single-use codes protected by PKCE S256. Call authorize
 * only after authenticating the browser user. After exchange, create a separate
 * native session and set its refresh cookie on the exchange HTTP response.
 * This helper does not authenticate users or register public HTTP endpoints.
 */
export class NativeAuthHandoff<T> {
  private readonly now: () => number
  private readonly redirectUris: ReadonlySet<string>

  constructor(private readonly options: NativeAuthHandoffOptions<T>) {
    this.now = options.now ?? Date.now
    this.redirectUris = new Set(options.redirectUris)

    for (const uri of this.redirectUris) {
      const url = new URL(uri)

      if (!url.protocol.includes('.') || url.username || url.password || url.search || url.hash) {
        throw new Error('Native redirect URI must use a reverse-domain app scheme without credentials, query or fragment')
      }
    }
  }

  /**
   * Validates a registered callback and S256 challenge, then persists an intent.
   * Pass only application-authorized identity data as value.
   */
  async authorize(request: { value: T; challenge: string; redirectUri: string; state: string }): Promise<string> {
    this.validateRedirect(request.redirectUri)

    if (!CODE_PATTERN.test(request.challenge)) throw new Error('Invalid native authorization challenge')
    if (!request.state || request.state.length > 512) throw new Error('Invalid native authorization state')

    const code = randomBytes(32).toString('base64url')
    const codeHash = createHash('sha256').update(code).digest('hex')

    await this.options.store.create({ codeHash, challenge: request.challenge, redirectUri: request.redirectUri, expiresAt: this.now() + GRANT_LIFETIME_MS, value: request.value })

    const callback = new URL(request.redirectUri)

    callback.searchParams.set('code', code)
    callback.searchParams.set('state', request.state)

    return callback.href
  }

  /**
   * Consumes exactly one matching code. The verifier must never be sent through
   * the browser redirect; receive it only in the native exchange POST body.
   */
  async exchange(request: { code: string; verifier: string; redirectUri: string }): Promise<T> {
    this.validateRedirect(request.redirectUri)

    if (!CODE_PATTERN.test(request.code) || !VERIFIER_PATTERN.test(request.verifier)) {
      throw new Error('Invalid or expired native authorization code')
    }

    const codeHash = createHash('sha256').update(request.code).digest('hex')
    const challenge = createHash('sha256').update(request.verifier).digest('base64url')
    const value = await this.options.store.consume({ codeHash, challenge, redirectUri: request.redirectUri, now: this.now() })

    if (value === null) throw new Error('Invalid or expired native authorization code')

    return value
  }

  private validateRedirect(redirectUri: string): void {
    if (!this.redirectUris.has(redirectUri)) throw new Error('Unregistered native redirect URI')
  }
}
