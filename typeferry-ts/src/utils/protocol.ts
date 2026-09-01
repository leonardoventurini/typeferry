/**
 * Wire protocol for TypeFerry WebSocket communication.
 *
 * Replaces Socket.IO's multi-event system with a single JSON envelope per
 * WebSocket frame. Every message is EJSON-encoded text (preserving existing
 * Date/Binary/ObjectId round-tripping via Presentation.encode/decode).
 *
 * The `t` field is the discriminator that determines message shape.
 */

/** Discriminator for all WebSocket frame types. */
export enum MessageType {
  /** Client → Server: RPC call expecting a response */
  RPC = 'rpc',
  /** Client → Server: fire-and-forget RPC (no response) */
  RPC_VOID = 'rpc:void',
  /** Server → Client: RPC response correlated by `id` */
  RPC_RESPONSE = 'rpc:res',
  /** Server → Client: push event from a subscription */
  EVENT = 'event',
  /** Server → Client: authentication result after connection */
  AUTH = 'auth',
  /** Bidirectional: keep-alive ping (server-initiated) */
  PING = 'ping',
  /** Bidirectional: keep-alive pong (client response) */
  PONG = 'pong',
}

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

/** RPC call that expects a correlated response. */
export interface RpcMessage {
  readonly t: MessageType.RPC
  /** UUID for request/response correlation */
  readonly id: string
  readonly method: string
  readonly params?: unknown
}

/** Fire-and-forget RPC call (no response expected). */
export interface RpcVoidMessage {
  readonly t: MessageType.RPC_VOID
  readonly method: string
  readonly params?: unknown
}

/** Client ping response. */
export interface PongMessage {
  readonly t: MessageType.PONG
}

/** Union of all client-to-server message types. */
export type ClientMessage = RpcMessage | RpcVoidMessage | PongMessage

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

/** Successful RPC response. */
export interface RpcResponseSuccess {
  readonly t: MessageType.RPC_RESPONSE
  readonly id: string
  readonly result: unknown
}

/** Failed RPC response. */
export interface RpcResponseError {
  readonly t: MessageType.RPC_RESPONSE
  readonly id: string
  readonly error: string
  readonly errors?: unknown
}

/** Union of RPC response shapes. */
export type RpcResponseMessage = RpcResponseSuccess | RpcResponseError

/** Push event from a subscription channel. */
export interface EventMessage {
  readonly t: MessageType.EVENT
  readonly uuid: string
  readonly event: string
  readonly channel?: string
  readonly params?: unknown
}

/** Authentication result sent after WebSocket connection. */
export interface AuthMessage {
  readonly t: MessageType.AUTH
  readonly authenticated: boolean
}

/** Server-initiated keep-alive ping. */
export interface PingMessage {
  readonly t: MessageType.PING
}

/** Union of all server-to-client message types. */
export type ServerMessage =
  | RpcResponseMessage
  | EventMessage
  | AuthMessage
  | PingMessage

/** Any message that can travel over the wire. */
export type WireMessage = ClientMessage | ServerMessage

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Narrows a parsed envelope to an RPC call. */
export function isRpcMessage(msg: { t: string }): msg is RpcMessage {
  return msg.t === MessageType.RPC
}

/** Narrows a parsed envelope to a void RPC call. */
export function isRpcVoidMessage(msg: { t: string }): msg is RpcVoidMessage {
  return msg.t === MessageType.RPC_VOID
}

/** Narrows a parsed envelope to an RPC response. */
export function isRpcResponse(msg: { t: string }): msg is RpcResponseMessage {
  return msg.t === MessageType.RPC_RESPONSE
}

/** Narrows a parsed envelope to a push event. */
export function isEventMessage(msg: { t: string }): msg is EventMessage {
  return msg.t === MessageType.EVENT
}

/** Narrows a parsed envelope to an auth result. */
export function isAuthMessage(msg: { t: string }): msg is AuthMessage {
  return msg.t === MessageType.AUTH
}

/** Narrows a parsed envelope to a ping. */
export function isPingMessage(msg: { t: string }): msg is PingMessage {
  return msg.t === MessageType.PING
}

/** Narrows a parsed envelope to a pong. */
export function isPongMessage(msg: { t: string }): msg is PongMessage {
  return msg.t === MessageType.PONG
}
