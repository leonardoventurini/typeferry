/**
 * Normalized user profile returned by any OAuth provider.
 *
 * Each provider populates the subset of fields it supports.
 * The `raw` field carries the full provider-specific payload
 * for app-level access when the normalized fields aren't enough.
 */
export interface OAuthUserProfile {
  /** Provider-specific unique user identifier (e.g. Google `sub`). */
  providerId: string

  /** Provider name for discrimination (e.g. `'google'`, `'github'`). */
  provider: string

  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string

  /** Raw identity payload from the provider. */
  raw?: Record<string, unknown>
}

/**
 * Server-side OAuth provider contract.
 *
 * Implementations handle the provider-specific authorization-code
 * exchange and ID-token verification, returning a normalized profile.
 */
export interface OAuthProvider {
  /** Provider identifier (e.g. `'google'`). */
  readonly name: string

  /**
   * Exchange an authorization code for a verified user profile.
   *
   * @param code - Authorization code from the OAuth redirect/popup
   * @returns Normalized user profile
   * @throws On invalid code, network errors, or verification failure
   */
  exchangeCode(code: string): Promise<OAuthUserProfile>
}
