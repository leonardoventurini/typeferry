import type { ClientNode } from './client-node'

/**
 * WebSocket readyState constants matching the W3C spec.
 * Used instead of instance-level `ws.OPEN` so code works with both
 * the `ws` package and Bun's native `ServerWebSocket`.
 */
export const SocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

/**
 * Minimal WebSocket interface consumed by Bifrost server components.
 * Both `ws.WebSocket` and `Bun.ServerWebSocket` satisfy this contract.
 */
export interface BifrostSocket {
  readonly readyState: number
  /** Bytes accepted by the runtime but not yet flushed to the network. */
  readonly bufferedAmount?: number
  /** Bun-native read-only buffered-byte accessor. */
  getBufferedAmount?(): number
  send(data: string | Buffer): void
  close(code?: number, reason?: string): void
}

/** Result of a direct server-to-client event send. */
export interface BifrostSendState {
  /** Whether the frame was accepted by an open socket. */
  readonly accepted: boolean
  /** Native bytes waiting to flush after the send. */
  readonly bufferedBytes: number
}

/**
 * Per-connection data stored in `Bun.ServerWebSocket.data`.
 * Set during `server.upgrade()` and available in all websocket handlers.
 */
export interface ConnectionData {
  node: ClientNode | null
  uuid: string
  token?: string
  meta: Record<string, unknown>
  remoteAddress: string
  userAgent: string
  headers: Record<string, string>
}
