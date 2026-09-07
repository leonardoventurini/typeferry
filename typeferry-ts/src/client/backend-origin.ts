/**
 * Explicit backend locations for clients running outside their server origin.
 * Paths remain owned by the protocol and application, not by these origins.
 */
export interface BackendOrigins {
  httpOrigin: string
  webSocketOrigin?: string
}

function validateOrigin(value: string, protocols: readonly string[], message: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error(message)
  }

  if (!protocols.includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(message)
  }

  return url
}

/**
 * Validates explicit origins without including potentially secret input in errors.
 * The WebSocket origin defaults to the HTTP host with the corresponding scheme.
 */
export function resolveBackendOrigins(backend: BackendOrigins): Required<BackendOrigins> {
  const http = validateOrigin(backend.httpOrigin, ['http:', 'https:'], 'HTTP backend must be an HTTP(S) origin')
  const inferredSocket = new URL(http)

  inferredSocket.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'

  const socket = validateOrigin(backend.webSocketOrigin ?? inferredSocket.origin, ['ws:', 'wss:'], 'WebSocket backend must be a WS(S) origin')

  return { httpOrigin: http.origin, webSocketOrigin: socket.origin }
}

/**
 * Fetch-compatible request boundary that native hosts can implement privately.
 */
export type HttpFetch = (url: string, options?: RequestInit) => Promise<Response>
