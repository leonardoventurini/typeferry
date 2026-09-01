/**
 * Lifecycle events emitted by the Node/Hono HTTP transport.
 */
export enum HttpTransportEvents {
  HTTP_LISTENING = 'http:listening',
  HTTP_SERVER_ERROR = 'http:server:error',
  HTTP_SERVER_CLOSED = 'http:server:closed',
}

/**
 * Retryable response returned while application traffic is gated.
 */
export const SERVER_NOT_READY_RESPONSE = {
  body: 'Server Not Ready',
  retryAfterSeconds: 1,
  status: 503,
} as const
