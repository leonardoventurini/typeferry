import jwt from 'jsonwebtoken'

import type { AccessTokenPayload, AuthConfig } from '../types'

/**
 * Sign an access token with the configured algorithm.
 * Always uses explicit algorithm specification to prevent algorithm confusion attacks.
 *
 * @param payload - Token payload to sign
 * @param config - Auth configuration with secret and algorithm
 * @returns Signed JWT string
 */
export function signAccessToken(
  payload: AccessTokenPayload,
  config: AuthConfig,
): string {
  const algorithm = config.algorithm ?? 'HS256'
  return jwt.sign(payload, config.secret, { algorithm })
}

/**
 * Verify and decode an access token.
 * Uses explicit algorithm whitelist to prevent algorithm confusion attacks.
 *
 * @param token - JWT to verify (may include 'Bearer ' prefix)
 * @param config - Auth configuration with secret and algorithm
 * @returns Decoded payload if valid, null otherwise
 */
export function verifyAccessToken(
  token: string,
  config: AuthConfig,
): AccessTokenPayload | null {
  try {
    const algorithm = config.algorithm ?? 'HS256'
    const cleanToken = token.replace(/^Bearer\s+/i, '')

    return jwt.verify(cleanToken, config.secret, {
      algorithms: [algorithm],
      maxAge: `${config.accessTokenExpiryMinutes ?? 15}m`,
    }) as AccessTokenPayload
  } catch {
    return null
  }
}

/**
 * Decode a token without verification.
 * Useful for reading claims from expired tokens or tokens signed by other parties.
 *
 * WARNING: Do not trust the contents without verification.
 *
 * @param token - JWT to decode
 * @returns Decoded payload if parseable, null otherwise
 */
export function decodeToken(token: string): AccessTokenPayload | null {
  try {
    const cleanToken = token.replace(/^Bearer\s+/i, '')
    return jwt.decode(cleanToken) as AccessTokenPayload
  } catch {
    return null
  }
}
