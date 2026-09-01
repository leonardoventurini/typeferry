/**
 * Shared WebSocket transport logic used by both the ws-based and
 * Shared WebSocket protocol helpers, kept separate from listener lifecycle.
 */
import {
  Errors,
  MessageType,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
} from '../../utils'
import type { ClientNode } from '../client-node'
import { redactMethodTelemetry, type Method } from '../method'
import type { Server } from '../server'
import { SocketState } from '../types'

export const AUTH_TIMEOUT_MS = 5000
export const MAX_UUID_LENGTH = 64
export const MAX_META_SIZE = 10000
export const PING_INTERVAL_MS = 25000

/** Pre-encoded ping payload — avoids EJSON.stringify on every tick. */
export const PING_PAYLOAD = Presentation.encode({ t: MessageType.PING })

/**
 * Framework-neutral metadata exposed to an application handshake authenticator.
 */
export interface WebSocketHandshake {
  readonly path: string
  readonly headers: Readonly<Record<string, string>>
  readonly query: Readonly<Record<string, string>>
}

/**
 * Optional application-owned authentication for an admitted WebSocket.
 */
export type WebSocketHandshakeAuthenticator = (
  node: ClientNode,
  handshake: WebSocketHandshake,
) => unknown | Promise<unknown>

// ---------------------------------------------------------------------------
// RPC handling
// ---------------------------------------------------------------------------

/** Handles an RPC call and sends the response correlated by `id`. */
export async function handleRpc(
  server: Server,
  node: ClientNode,
  id: string,
  method: string,
  params?: unknown
): Promise<void> {
  if (node.limiter && !node.limiter.tryRemoveTokens(1)) {
    return sendResponse(node, id, undefined, Errors.RATE_LIMIT_EXCEEDED)
  }

  const methodInstance = server.methods.get(method)

  if (!methodInstance) {
    return sendResponse(node, id, undefined, Errors.METHOD_NOT_FOUND)
  }

  if (methodInstance.isProtected && !node.authenticated) {
    return sendResponse(node, id, undefined, Errors.METHOD_FORBIDDEN)
  }

  try {
    const result = await methodInstance.exec(params, node)
    sendResponse(node, id, result)
  } catch (error) {
    handleRpcError(server, node, methodInstance, error, id, method, params)
  }
}

/** Handles fire-and-forget RPC calls (no response sent). */
export async function handleRpcVoid(
  server: Server,
  node: ClientNode,
  method: string,
  params?: unknown
): Promise<void> {
  if (node.limiter && !node.limiter.tryRemoveTokens(1)) {
    console.warn('[TypeFerry] Rate limit exceeded for void call:', method)
    return
  }

  const methodInstance = server.methods.get(method)

  if (!methodInstance) {
    console.warn('[TypeFerry] Method not found for void call:', method)
    return
  }

  if (methodInstance.isProtected && !node.authenticated) {
    console.warn('[TypeFerry] Method forbidden for void call:', method)
    return
  }

  try {
    await methodInstance.exec(params, node)
  } catch (error) {
    if (methodInstance.isSensitive) {
      console.error(`[TypeFerry] Sensitive void method "${method}" failed`)
    } else {
      console.error('[TypeFerry] Void method execution error:', error)
    }

    server.emit(ServerEvents.METHOD_ERROR, {
      error: redactMethodTelemetry(methodInstance, error),
      method,
      params: redactMethodTelemetry(methodInstance, params),
      userId: node.userId,
      userEmail: node.context?.user?.email,
      remoteAddress: node.remoteAddress,
      userAgent: node.userAgent,
    })
  }
}

/** Sends a correlated RPC response to the client. */
export function sendResponse(
  node: ClientNode,
  id: string,
  result?: unknown,
  error?: string,
  errors?: unknown
): void {
  if (!node.socket || node.socket.readyState !== SocketState.OPEN) return

  const payload: Record<string, unknown> = {
    t: MessageType.RPC_RESPONSE,
    id,
  }

  if (error) {
    payload.error = error
    if (errors) payload.errors = errors
  } else {
    payload.result = result
  }

  node.socket.send(Presentation.encode(payload))
}

function handleRpcError(
  server: Server,
  node: ClientNode,
  methodInstance: Method<any, any>,
  error: unknown,
  id: string,
  method: string,
  params: unknown
): void {
  if (error instanceof PublicError) {
    return sendResponse(node, id, undefined, error.message)
  }

  if (methodInstance.isSensitive) {
    console.error(`[TypeFerry] Sensitive method "${method}" failed`)
  } else {
    console.error(error)
  }

  server.emit(ServerEvents.METHOD_ERROR, {
    error: redactMethodTelemetry(methodInstance, error),
    method,
    params: redactMethodTelemetry(methodInstance, params),
    userId: node.userId,
    userEmail: node.context?.user?.email,
    remoteAddress: node.remoteAddress,
    userAgent: node.userAgent,
  })

  if (error instanceof SchemaValidationError) {
    return sendResponse(node, id, undefined, error.message, error.errors)
  }

  sendResponse(node, id, undefined, Errors.INTERNAL_ERROR)
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Authenticates a node after connection. Guards against the node
 * disconnecting during the async auth call.
 */
export async function authenticateNode(
  server: Server,
  node: ClientNode,
  token: string | undefined,
  handshakeAuthenticator?: WebSocketHandshakeAuthenticator,
  handshake?: WebSocketHandshake,
): Promise<void> {
  if (!handshakeAuthenticator && (!server.isAuthEnabled || !token)) {
    node.emitAuthResult(false)
    return
  }

  try {
    const authPromise = handshakeAuthenticator
      ? Promise.resolve(
          handshakeAuthenticator(
            node,
            handshake ?? { path: '', headers: {}, query: {} },
          ),
        )
      : server.auth.call(node, { token })
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Auth timeout')), AUTH_TIMEOUT_MS)
    )

    const result = await Promise.race([authPromise, timeoutPromise])

    if (!node.socket || node.socket.readyState !== SocketState.OPEN) return

    if (result) {
      node.authenticated = true
      node.setContext(result)
      server.emit(ServerEvents.AUTHENTICATION, node)
    }

    node.emitAuthResult(node.authenticated)
  } catch (error) {
    console.error('[TypeFerry] Auth error:', error)
    if (node.socket?.readyState === SocketState.OPEN) {
      node.emitAuthResult(false)
    }
  }
}

// ---------------------------------------------------------------------------
// Connection parameter validation
// ---------------------------------------------------------------------------

/** Validates and sanitizes a UUID from the client query string. */
export function validateUuid(uuid: unknown): string {
  if (
    typeof uuid !== 'string' ||
    uuid.length === 0 ||
    uuid.length > MAX_UUID_LENGTH
  ) {
    return (
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
  }
  return uuid.replace(/[^a-zA-Z0-9-]/g, '').slice(0, MAX_UUID_LENGTH)
}

/** Validates and sanitizes a meta object. */
export function validateMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  try {
    if (JSON.stringify(meta).length > MAX_META_SIZE) {
      console.warn('[TypeFerry] Meta object too large, ignoring')
      return {}
    }
  } catch {
    return {}
  }
  return meta as Record<string, unknown>
}

/** Parses meta from a query string value (JSON-encoded in the URL). */
export function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return validateMeta(JSON.parse(raw))
  } catch {
    return {}
  }
}
