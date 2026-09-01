import { OAuth2Client } from 'google-auth-library'

import type { OAuthProvider, OAuthUserProfile } from './types'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  /**
   * Redirect URI for the OAuth flow.
   * Defaults to `'postmessage'` for popup-based flows.
   */
  redirectUri?: string
}

/**
 * Google OAuth provider that exchanges authorization codes for
 * verified user profiles via the Google Identity Platform.
 *
 * @example
 * ```ts
 * const google = new GoogleOAuthProvider({
 *   clientId: process.env.GOOGLE_CLIENT_ID,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 * })
 *
 * const profile = await google.exchangeCode(code)
 * // → { providerId, provider: 'google', email, name, picture, ... }
 * ```
 */
export class GoogleOAuthProvider implements OAuthProvider {
  readonly name = 'google' as const
  private readonly client: OAuth2Client

  constructor(config: GoogleOAuthConfig) {
    this.client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri ?? 'postmessage',
    )
  }

  async exchangeCode(code: string): Promise<OAuthUserProfile> {
    const { tokens } = await this.client.getToken(code)

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token!,
    })

    const payload = ticket.getPayload()!

    return {
      providerId: payload.sub,
      provider: this.name,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
      raw: payload as unknown as Record<string, unknown>,
    }
  }
}
