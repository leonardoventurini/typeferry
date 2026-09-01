import { RateLimiter } from 'limiter'

import { MessageType, Presentation, ServerEvents } from '../utils'
import EventEmitter2 from '../utils/event-emitter'
import type { TypeFerryRequest, TypeFerryResponse } from './request-types'
import type { RateLimit, Server } from './server'
import type { TypeFerrySendState, TypeFerrySocket } from './types'
import { SocketState } from './types'

export type ClientNodeContext = Record<string, any>

export class ClientNode extends EventEmitter2 {
  uuid: string
  isAuthenticated = false
  meta: Record<string, any> = {}
  context: ClientNodeContext = {}
  userId: any = null
  user: Record<string, any> = null
  socket?: TypeFerrySocket | null
  /** Framework-agnostic request exposed by the Hono adapter. */
  req?: TypeFerryRequest
  /** Framework-agnostic response exposed by the Hono adapter. */
  res?: TypeFerryResponse
  isServer = false
  limiter: RateLimiter
  server: Server
  headers: Record<string, string> = {}
  remoteAddress: string | string[]
  userAgent: string

  constructor(
    server: Server,
    socket?: TypeFerrySocket | null,
    req?: TypeFerryRequest,
    res?: TypeFerryResponse,
    limit?: RateLimit
  ) {
    super()

    this.server = server
    this.socket = socket
    this.req = req
    this.res = res

    if (limit) {
      this.limiter = new RateLimiter(
        limit === true
          ? {
              tokensPerInterval: 60,
              interval: 60 * 1000,
            }
          : {
              tokensPerInterval: limit.max,
              interval: limit.interval,
            }
      )
    }
  }

  get authenticated() {
    return this.isAuthenticated
  }

  set authenticated(authenticated: boolean) {
    this.isAuthenticated = authenticated
  }

  get readyState(): number | undefined {
    return this.socket?.readyState
  }

  setId(uuid: string) {
    this.uuid = uuid
  }

  setContext(context: ClientNodeContext) {
    this.context = this.authenticated ? context : {}

    this.setUserId()
  }

  /**
   * Extracts tracking properties (headers, IP, user-agent) from a request.
   * Accepts both Node `IncomingMessage` and the framework-agnostic `TypeFerryRequest`.
   */
  setTrackingProperties(source: {
    headers?: Record<string, string | string[] | undefined>
    ip?: string
    socket?: { remoteAddress?: string }
  }): void {
    this.headers = (source.headers ?? {}) as Record<string, string>
    this.userAgent = (source.headers?.['user-agent'] as string) ?? ''
    this.remoteAddress =
      (source.headers?.['x-forwarded-for'] as string) ??
      source.socket?.remoteAddress ??
      source.ip ??
      ''
  }

  // The user ID is used for authorizing the user's channel.
  setUserId() {
    if (!this.authenticated) return

    const userId = this.context?.user?._id

    if (!userId) {
      throw new Error(
        'The auth function must return a user object with a valid "_id" property'
      )
    }

    this.userId = String(this.context.user._id)
    this.user = this.context.user
    this.server?.indexClientByUserId(this)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket Message Emitters
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sends a push event to the client.
   * Uses the wire protocol `{ t: "event", ... }` envelope.
   */
  emitTypeFerryEvent(event: string, channel?: string, params?: unknown): void {
    this.sendTypeFerryEvent(event, channel, params)
  }

  /**
   * Sends a push event and returns the native transport pressure.
   *
   * Live data delivery uses this result to avoid hiding slow consumers behind
   * the WebSocket runtime's own queue.
   */
  sendTypeFerryEvent(
    event: string,
    channel?: string,
    params?: unknown
  ): TypeFerrySendState {
    if (!this.socket || this.socket.readyState !== SocketState.OPEN) {
      return { accepted: false, bufferedBytes: this.bufferedBytes }
    }

    try {
      this.socket.send(
        Presentation.encode({
          t: MessageType.EVENT,
          uuid: Presentation.uuid(),
          event,
          channel,
          params,
        })
      )
    } catch {
      return { accepted: false, bufferedBytes: this.bufferedBytes }
    }

    return { accepted: true, bufferedBytes: this.bufferedBytes }
  }

  /** Whether the transport exposes native queued-byte pressure. */
  get supportsBufferedBytes(): boolean {
    return typeof this.socket?.bufferedAmount === 'number'
  }

  /** Returns native bytes queued by the WebSocket runtime without sending. */
  get bufferedBytes(): number {
    try {
      return this.socket?.bufferedAmount ?? 0
    } catch {
      return 0
    }
  }

  /**
   * Sends an error to the client.
   */
  emitError(payload: {
    uuid?: string
    message: string
    method?: string
    errors?: unknown
  }): void {
    if (!this.socket || this.socket.readyState !== SocketState.OPEN) return

    this.socket.send(Presentation.encode(payload))
  }

  /**
   * Sends authentication result to the client.
   * Uses the wire protocol `{ t: "auth", ... }` envelope.
   */
  emitAuthResult(authenticated: boolean): void {
    if (!this.socket || this.socket.readyState !== SocketState.OPEN) return

    this.socket.send(
      Presentation.encode({ t: MessageType.AUTH, authenticated })
    )
  }

  /** Idempotency guard — prevents duplicate DISCONNECT events. */
  private closed = false

  close(): void {
    if (this.closed) return
    this.closed = true

    if (this.socket) {
      this.socket.close()
    }

    this.emit(ServerEvents.DISCONNECT)
    this.server.emit(ServerEvents.DISCONNECTION, this)
  }
}
