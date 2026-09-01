/**
 * Framework-agnostic request/response interfaces for TypeFerry.
 *
 * Hono request adapters satisfy these contracts, keeping `ClientNode` and
 * authentication logic independent from the HTTP adapter internals.
 */

/** Minimal request interface for auth and tracking. */
export interface TypeFerryRequest {
  headers: Record<string, string | string[] | undefined>
  ip?: string
  path?: string
  get?: (name: string) => string | undefined
  socket?: { remoteAddress?: string }
}

/** Minimal response interface for cookie/header setting. */
export interface TypeFerryResponse {
  setHeader(name: string, value: string): void
}
