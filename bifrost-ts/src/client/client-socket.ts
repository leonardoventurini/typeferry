import {
  BIFROST_WS_PATH,
  ClientEvents,
  MessageType,
  Presentation,
  isAuthMessage,
  isEventMessage,
  isPingMessage,
  isRpcResponse,
} from '../utils'
import EventEmitter2 from '../utils/event-emitter'
import type { Client, WebSocketOptions } from './client'
import { LogLevel } from './logger'

/** Tracks a pending RPC call awaiting a correlated response. */
interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 500
const MAX_RECONNECT_DELAY = 10000
const JITTER_FACTOR = 0.5

/**
 * Native WebSocket transport for the Bifrost client.
 *
 * Replaces Socket.IO with the browser's built-in WebSocket API. RPC calls
 * are correlated via UUID — the client generates an `id` per call and the
 * server echoes it back in the response.
 *
 * Reconnection uses exponential backoff (500ms → 10s, 10 attempts, 0.5
 * jitter) matching the previous Socket.IO configuration.
 */
export class ClientSocket extends EventEmitter2 {
  client: Client
  socket: WebSocket | undefined

  protocol: string
  uri: string
  stopped = false
  connecting = false

  options: WebSocketOptions = {
    path: BIFROST_WS_PATH,
  }

  /** UUID-keyed map of in-flight RPC calls awaiting responses. */
  private pending = new Map<string, PendingRequest>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  /** Prevents infinite loop between scheduleReconnect and VisibilityManager. */
  private exhaustedReconnect = false

  get ready(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  constructor(client: Client, options: WebSocketOptions = {}) {
    super()

    this.client = client
    Object.assign(this.options, options ?? {})

    const wsProtocol = this.client.options.secure ? 'wss://' : 'ws://'
    this.protocol = this.client.options.secure ? 'https://' : 'http://'

    if (this.client.options.port) {
      this.uri = `${wsProtocol}${this.client.options.host}:${this.client.options.port}`
    } else {
      this.uri = `${wsProtocol}${this.client.options.host}`
    }
  }

  connect(): void {
    if (this.ready) {
      this.client.logger.connection(LogLevel.WARN, 'Already connected')
      return
    }

    this.stopped = false
    this.connecting = true
    this.reconnectAttempt = 0
    this.client.emit(ClientEvents.CONNECTING)

    this.createSocket()
  }

  /**
   * Builds the WebSocket URL with auth data as query parameters and opens
   * a new connection. Query params mirror the old `socket.handshake.auth`.
   */
  private createSocket(): void {
    const { token } = this.client.context ?? {}
    const params = new URLSearchParams()

    if (token) params.set('token', String(token))
    params.set('uuid', this.client.uuid)

    const meta = this.client.options.meta
    if (meta && Object.keys(meta).length > 0) {
      params.set('meta', JSON.stringify(meta))
    }

    const url = `${this.uri}${this.options.path}?${params.toString()}`

    const ws = new WebSocket(url)
    this.socket = ws

    /**
     * Event handlers are bound per-socket to prevent stale close events
     * from old sockets (which fire asynchronously) from affecting the
     * current connection. Each handler checks `this.socket === ws` to
     * ensure it's still the active socket.
     */
    ws.onopen = () => {
      if (this.socket === ws) this.handleOpen()
    }

    ws.onmessage = (ev: MessageEvent) => {
      if (this.socket === ws) this.handleMessage(ev.data as string)
    }

    ws.onclose = () => {
      if (this.socket === ws) this.handleClose()
    }

    ws.onerror = () => {
      if (this.socket === ws) {
        this.handleSocketError(new Error('WebSocket error'))
      }
    }
  }

  async close(): Promise<void> {
    this.stopped = true
    this.connecting = false
    this.clearReconnectTimer()

    this.clearAllPending()

    if (!this.socket) {
      this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
      return
    }

    if (this.socket.readyState === WebSocket.CLOSED) {
      this.socket = undefined
      this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
      return
    }

    const socketToClose = this.socket

    const closed = new Promise<void>(resolve => {
      if (!socketToClose) return resolve()

      const onClose = (): void => {
        socketToClose.removeEventListener('close', onClose)
        resolve()
      }
      socketToClose.addEventListener('close', onClose)
    })

    socketToClose.close()
    await closed

    // Only clear if this is still the active socket (connect() may have
    // replaced it with a new one during the async close wait).
    if (this.socket === socketToClose) {
      this.socket = undefined
    }
    this.client.emit(ClientEvents.WEBSOCKET_CLOSED)
  }

  /**
   * Sends a fire-and-forget RPC message (void call).
   * @param data - Object containing `method` and optional `params`
   */
  public send(
    _event: string,
    data: { method: string; params?: unknown },
  ): void {
    if (!this.ready) {
      this.client.logger.connection(
        LogLevel.WARN,
        'Socket not ready, cannot send',
        { ready: this.ready, connecting: this.connecting },
      )
      return
    }

    this.socket?.send(
      Presentation.encode({
        t: MessageType.RPC_VOID,
        method: data.method,
        params: data.params,
      }),
    )
  }

  /**
   * Sends an RPC call and returns a promise that resolves when the server
   * responds with a correlated `{ t: "rpc:res", id }` message.
   *
   * Uses UUID-based request correlation instead of Socket.IO acknowledgments.
   */
  public emitWithAck<T>(
    _event: string,
    data: { method: string; params?: unknown },
    timeout = 20000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        reject(new Error('Socket not ready'))
        return
      }

      const id = Presentation.uuid()

      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Acknowledgment timeout'))
      }, timeout)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      this.socket?.send(
        Presentation.encode({
          t: MessageType.RPC,
          id,
          method: data.method,
          params: data.params,
        }),
      )
    })
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private handleMessage(raw: string): void {
    try {
      const msg = Presentation.decode<{ t: string }>(raw)

      if (isRpcResponse(msg)) {
        this.handleRpcResponse(msg)
      } else if (isEventMessage(msg)) {
        this.handleTypedEvent(raw)
      } else if (isAuthMessage(msg)) {
        this.handleTypedAuth(msg)
      } else if (isPingMessage(msg)) {
        this.socket?.send(Presentation.encode({ t: MessageType.PONG }))
      }
    } catch {
      // Malformed message — ignore
    }
  }

  /**
   * Resolves or rejects the pending RPC call matching the response `id`.
   */
  private handleRpcResponse(msg: {
    id: string
    result?: unknown
    error?: string
  }): void {
    const entry = this.pending.get(msg.id)
    if (!entry) return

    this.pending.delete(msg.id)
    clearTimeout(entry.timer)

    if (msg.error) {
      entry.reject(new Error(msg.error))
    } else {
      entry.resolve(msg.result)
    }
  }

  /** Handles subscription events from the server. */
  private handleTypedEvent(raw: string): void {
    const payload = Presentation.decode<Presentation.Payload>(raw)
    if (!payload) return

    this.client.handleEvent(payload)
  }

  /** Handles authentication result from the server. */
  private handleTypedAuth(msg: { authenticated: boolean }): void {
    this.client.authenticated = msg.authenticated
    this.client.initialize()
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  private handleOpen(): void {
    this.client.emit(ClientEvents.WEBSOCKET_CONNECTED)
    this.connecting = false
    this.reconnectAttempt = 0
    this.exhaustedReconnect = false
  }

  private handleClose(): void {
    this.client.initialized = false
    this.client.initializing = false

    this.rejectAllPending('Connection lost')
    this.client.emit(ClientEvents.WEBSOCKET_CLOSED)

    if (this.stopped) {
      this.socket = undefined
      return
    }

    this.scheduleReconnect()
  }

  private handleSocketError = (error: Error): void => {
    this.connecting = false

    this.client.logger.connection(
      LogLevel.ERROR,
      'Socket error',
      { uri: this.uri, socketReady: this.ready },
      error,
    )

    this.client.emit(ClientEvents.ERROR, error)
  }

  // ---------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // ---------------------------------------------------------------------------

  /**
   * Schedules a reconnection attempt with exponential backoff and jitter.
   * After exhausting all attempts, delegates to VisibilityManager for a
   * full reconnect (token refresh + new socket). Stops after one
   * VisibilityManager cycle to prevent infinite loops when the server
   * is unreachable.
   */
  private scheduleReconnect(): void {
    if (this.stopped) return

    this.reconnectAttempt++

    if (this.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      if (!this.exhaustedReconnect) {
        this.exhaustedReconnect = true
        this.client.visibilityManager?.reconnect()
      }
      return
    }

    const base = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempt - 1),
      MAX_RECONNECT_DELAY,
    )
    const jitter = base * JITTER_FACTOR * Math.random()
    const delay = base + jitter

    this.connecting = true
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.socket = undefined
      this.createSocket()
    }, delay)
  }

  clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  /** Rejects all in-flight RPC calls on unexpected disconnect. */
  private rejectAllPending(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    this.pending.clear()
  }

  /**
   * Clears all in-flight RPC calls without rejecting during intentional close.
   * Prevents unhandled rejections when callers don't `.catch()` abandoned calls.
   */
  private clearAllPending(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
    }
    this.pending.clear()
  }
}
