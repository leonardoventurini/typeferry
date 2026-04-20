/**
 * Framework-agnostic request/response interfaces for Bifrost.
 *
 * Both Express `Request`/`Response` and Hono `Context`-based adapters
 * satisfy these contracts, allowing `ClientNode` and auth middleware
 * to work with either framework.
 */

/** Minimal request interface for auth and tracking. */
export interface BifrostRequest {
  headers: Record<string, string | string[] | undefined>
  ip?: string
  get?: (name: string) => string | undefined
  socket?: { remoteAddress?: string }
}

/** Minimal response interface for cookie/header setting. */
export interface BifrostResponse {
  setHeader(name: string, value: string): void
}
