/**
 * WebSocket readyState constants matching the W3C spec.
 * Used instead of instance-level constants to keep the socket contract small.
 */
export const SocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

/**
 * Minimal WebSocket interface consumed by Bifrost server components.
 */
export interface BifrostSocket {
  readonly readyState: number
  /** Bytes accepted by the runtime but not yet flushed to the network. */
  readonly bufferedAmount?: number
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
