import type { CookieOptions } from '../types'

/**
 * Response-like object that can set headers.
 */
interface ResponseLike {
  setHeader: (name: string, value: string) => void
}

/**
 * Request-like object that may contain cookies.
 */
interface RequestLike {
  cookies?: Record<string, string>
  headers?: { cookie?: string }
}

/**
 * Set an HttpOnly refresh token cookie.
 *
 * @param res - Response object with setHeader method
 * @param token - Refresh token value
 * @param options - Cookie configuration
 */
export function setRefreshTokenCookie(
  res: ResponseLike,
  token: string,
  options: CookieOptions,
): void {
  const maxAge = options.maxAgeDays * 24 * 60 * 60
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  /**
   * Lax prevents CSRF on cross-site POST while still sending the cookie
   * on same-site navigations and Vite HMR reloads. Strict caused the
   * refresh cookie to be dropped during dev hot reloads.
   */
  const sameSite = options.sameSite ?? 'Lax'
  const path = options.path ?? '/'

  // URL-encode token to handle special characters (;, =, etc.)
  const encodedToken = encodeURIComponent(token)

  const parts = [
    `${options.name}=${encodedToken}`,
    'HttpOnly',
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
  ]

  if (secure) {
    parts.push('Secure')
  }

  res.setHeader('Set-Cookie', parts.join('; '))
}

/**
 * Clear a refresh token cookie by setting it to expire immediately.
 *
 * @param res - Response object with setHeader method
 * @param options - Cookie configuration (name, secure, path)
 */
export function clearRefreshTokenCookie(
  res: ResponseLike,
  options: Pick<CookieOptions, 'name' | 'secure' | 'path'>,
): void {
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  const path = options.path ?? '/'

  const parts = [
    `${options.name}=`,
    'HttpOnly',
    `Path=${path}`,
    'Max-Age=0',
    'SameSite=Lax',
  ]

  if (secure) {
    parts.push('Secure')
  }

  res.setHeader('Set-Cookie', parts.join('; '))
}

/**
 * Extract refresh token from a request.
 * Checks parsed cookies first, then falls back to manual cookie header parsing.
 * Automatically URL-decodes the cookie value.
 *
 * @param req - Request object with optional cookies or cookie header
 * @param cookieName - Name of the cookie to extract
 * @returns Cookie value if found, undefined otherwise
 */
export function getRefreshTokenFromRequest(
  req: RequestLike,
  cookieName: string,
): string | undefined {
  // Check parsed cookies first (if cookie-parser middleware was used)
  // cookie-parser auto-decodes, so no need to decode again
  if (req.cookies?.[cookieName]) {
    return req.cookies[cookieName]
  }

  // Fall back to manual parsing from cookie header
  const cookieHeader = req.headers?.cookie
  if (!cookieHeader) {
    return undefined
  }

  // Escape regex special characters in cookie name to prevent injection
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cookieHeader.match(
    // eslint-disable-next-line security/detect-non-literal-regexp -- pattern is escaped above
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`),
  )

  if (!match) {
    return undefined
  }

  // URL-decode the cookie value (matches our encoding in setRefreshTokenCookie)
  try {
    return decodeURIComponent(match[1])
  } catch {
    // If decode fails, return raw value (backwards compatibility)
    return match[1]
  }
}
