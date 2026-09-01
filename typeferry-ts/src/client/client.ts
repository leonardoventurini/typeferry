import isEqual from 'fast-deep-equal'
import qs from 'query-string'

import { isEmpty, isPlainObject, merge } from '../utils/lodash'

import type { CallOptions, MethodParams, ServerMethods } from '../utils'
import {
  TypeFerryEvents,
  ClientEvents,
  Environment,
  Errors,
  Methods,
  NO_CHANNEL,
  PayloadType,
  Presentation,
  TOKEN_HEADER_KEY,
} from '../utils'
import { callMethodProxy } from './call-method-proxy'
import { ClientChannel } from './client-channel'
import { ClientHttp } from './client-http'
import { ClientSocket } from './client-socket'
import type { TypeFerryContext } from './context-manager'
import { ContextManager } from './context-manager'
import { IdleTimer } from './idle-timer'
import type { TypeFerryLogger } from './logger'
import { logger, LogLevel } from './logger'
import { VisibilityManager } from './visibility-manager'
type Timeout = ReturnType<typeof setTimeout>

export type ErrorHandler = (error: Record<string, any>) => any

export type WebSocketOptions = {
  path?: string

  /**
   * Workaround for Safari not reconnecting after the app is brought back to the foreground.
   */
  disconnectOnPageHide?: boolean
}

export type WebSocketRequestParams = {
  [x: string]: any
  [x: number]: any
}

export type ClientOptions = {
  host?: string
  port?: number
  /**
   * Port for HTTP requests (login, refresh). When omitted, falls back
   * to `port`. Leave undefined in dev so HTTP goes through Vite's proxy
   * (same origin as page), ensuring HttpOnly cookies work correctly.
   */
  httpPort?: number
  secure?: boolean
  ws?: WebSocketOptions
  errorHandler?: ErrorHandler
  /** @deprecated Use logLevel instead */
  debug?: boolean
  /** Log level for the client (default: WARN) */
  logLevel?: LogLevel
  allowedContextKeys?: string[]
  meta?: Record<string, any>
  idlenessTimeout?: number
  /**
   * Initial context to set before the first WebSocket connection.
   * With native WebSocket, auth data is sent as query parameters during
   * connection — the token must be available at socket creation time.
   */
  initialContext?: Record<string, unknown>
}

export type ProxyMethodCall = { [key: string]: ProxyMethodCall } & (<
  T = any,
  R = any,
>(
  params?: MethodParams<T>,
  options?: CallOptions,
) => Promise<R>)

/**
 * When working with Next.js, it is probably a good idea to not run this in the
 * server side by using it inside a `useEffect` hook.
 */
export class Client<
  MethodsType extends ServerMethods = ServerMethods,
> extends ClientChannel {
  uuid: string

  clientSocket: ClientSocket
  clientHttp: ClientHttp
  contextManager: ContextManager
  errorHandler: ErrorHandler

  channels: Map<string, ClientChannel> = new Map()

  timeouts: Set<Timeout> = new Set()

  initialized = false

  authenticated = false

  options: ClientOptions = {
    host: 'localhost',
    secure: false,
    errorHandler: null,
    debug: false,
    logLevel: LogLevel.WARN,
    allowedContextKeys: [],
    meta: {},
  }

  /** Logger instance for this client */
  logger: TypeFerryLogger = logger

  initializing: boolean

  visibilityManager: VisibilityManager
  idleTimer: IdleTimer | null = null

  m: MethodsType

  // Note: Heartbeat is handled by application-level ping/pong in the WebSocket transport

  get context(): TypeFerryContext {
    return this.contextManager.context
  }

  set context(value: TypeFerryContext) {
    this.contextManager.context = value
  }

  constructor(options: ClientOptions = {}) {
    super(NO_CHANNEL)

    this.m = callMethodProxy(this) as unknown as MethodsType

    this.uuid = Presentation.uuid()

    this.setClient(this)

    this.options = merge(this.options, options)

    const storage =
      typeof localStorage !== 'undefined' ? localStorage : undefined
    this.contextManager = new ContextManager(storage)
    this.contextManager.on(ClientEvents.CONTEXT_CHANGED, () =>
      this.emit(ClientEvents.CONTEXT_CHANGED),
    )

    this.clientHttp = new ClientHttp(this)

    this.channels.set(NO_CHANNEL, this)

    /**
     * The client should only ever be ready when the context is loaded,
     * scheduling the client socket construction for after the context
     * is first loaded does the trick as the init event is only emitted after
     * the ClientSocket is built.
     */
    this.loadContext()

    if (this.options.initialContext) {
      this.setContext(this.options.initialContext)
    }

    this.authenticated = !!this.context.token

    this.clientSocket = new ClientSocket(this, this.options.ws)

    // Configure logger level
    if (this.options.logLevel !== undefined) {
      this.logger.setLevel(this.options.logLevel)
    } else if (this.options.debug) {
      this.logger.setLevel(LogLevel.DEBUG)
    }

    this.on(ClientEvents.ERROR, error => {
      this.logger.connection(LogLevel.ERROR, 'Client error', { error })
    })

    if (Environment.isBrowser && Environment.isDevelopment) {
      // @ts-ignore
      window.TypeFerry = this
    }

    this.connect().catch(error => {
      this.logger.connection(LogLevel.ERROR, 'Connection failed', { error })
    })

    const { idlenessTimeout } = this.options
    this.idleTimer = idlenessTimeout
      ? new IdleTimer(this, idlenessTimeout)
      : null
    this.visibilityManager = new VisibilityManager(this, this.idleTimer)
  }

  get isConnecting() {
    return !!this.clientSocket?.connecting
  }

  /**
   * Forces a reconnection. Useful for testing or manual recovery.
   */
  reconnect(): void {
    this.visibilityManager.reconnect()
  }

  get isOffline() {
    return !this.clientSocket?.ready
  }

  get isOnline() {
    return !!this.clientSocket?.ready
  }

  get connected() {
    return this.clientSocket.ready
  }

  /**
   * Opens the WebSocket connection and waits for initialization.
   * Reconnection is handled entirely by ClientSocket's exponential
   * backoff — this method just waits for the first successful init.
   */
  async connect(): Promise<void> {
    this.clientSocket.connect()

    try {
      await this.waitFor(ClientEvents.INITIALIZED, 30000)
    } catch (error) {
      this.logger.connection(
        LogLevel.ERROR,
        'Initialization failed',
        {},
        error as Error,
      )
      this.emit(ClientEvents.INITIALIZATION_FAILED, { error })
    }
  }

  /** Delegates to ContextManager. */
  loadContext(): void {
    this.contextManager.loadContext()
  }

  /** Delegates to ContextManager. */
  setContext(context: Record<string, unknown>): void {
    this.contextManager.setContext(context)
  }

  /**
   * Sets context (if changed) and reconnects the socket to re-authenticate.
   * Stops the current socket without triggering auto-reconnection, then
   * opens a fresh connection with the new context (token in query params).
   */
  async setContextAndReInit(context: Record<string, unknown>): Promise<void> {
    if (!isEqual(this.context, context)) {
      this.setContext(context)
    }

    // Stop any ongoing reconnection attempts before starting fresh.
    this.clientSocket.stopped = true
    this.clientSocket.clearReconnectTimer()

    const oldSocket = this.clientSocket.socket
    if (oldSocket) {
      oldSocket.onclose = null
      oldSocket.onerror = null
      oldSocket.onmessage = null
      oldSocket.close()
      this.clientSocket.socket = undefined
    }

    this.logger.auth(LogLevel.DEBUG, 'setContextAndReInit: connecting')
    this.clientSocket.connect()
    this.logger.auth(
      LogLevel.DEBUG,
      'setContextAndReInit: waiting for INITIALIZED',
    )
    await this.waitFor(ClientEvents.INITIALIZED, 10000)
    this.logger.auth(LogLevel.DEBUG, 'setContextAndReInit: done')
  }

  /** Delegates to ContextManager. */
  updateContext(context: Record<string, unknown>): void {
    this.contextManager.updateContext(context)
  }

  /** Delegates to ContextManager. */
  clearContext(): void {
    this.contextManager.clearContext()
  }

  async close() {
    this.emit(ClientEvents.CLOSE)

    this.timeouts.forEach(timeout => clearTimeout(timeout))

    this.idleTimer?.destroy()
    this.visibilityManager.destroy()

    // Clear event sub/unsub timeouts.
    this.channels.forEach(channel => {
      channel.emit(TypeFerryEvents.COMMIT_PENDING_SUBSCRIPTIONS, {})
    })

    this.channels.forEach(channel => {
      channel.emit(TypeFerryEvents.COMMIT_PENDING_UNSUBSCRIPTIONS, {})
    })

    await this.clientSocket.close()
  }

  /**
   * Initializes the client. It should be called before any other method.
   *
   * It should be called whenever a transport is connected, either on reconnection or from calling `connect`.
   * Auth now happens during connection handshake. The authenticated state is set by AUTH_RESULT message.
   */
  async initialize() {
    if (this.initializing) {
      await this.waitFor(ClientEvents.INITIALIZED)
      return
    }

    this.initializing = true
    this.initialized = false
    this.loadContext()
    this.emit(ClientEvents.INITIALIZING)

    this.initialized = true
    this.initializing = false

    await this.resubscribeAllChannels()
    this.emit(ClientEvents.INITIALIZED, this.authenticated)

    return true
  }

  /**
   * The login method is always called via http so a http-only cookie can be set if the user so prefers.
   */
  async login(params: WebSocketRequestParams, opts?: CallOptions) {
    const response = await this.call(Methods.RPC_LOGIN, params, {
      ...opts,
      http: true,
    })

    if (!response || isEmpty(response)) {
      throw new Error(Errors.AUTHENTICATION_FAILED)
    }

    if (isPlainObject(response)) {
      await this.setContextAndReInit(response)
    }
  }

  async logout() {
    await this.call(Methods.RPC_LOGOUT)
    this.authenticated = false
    this.clearContext()
    this.emit(ClientEvents.LOGOUT, false)
  }

  async resubscribeAllChannels() {
    for (const [, channel] of this.channels) {
      await channel.resubscribe()
    }
  }

  async disconnect() {
    return this.close()
  }

  /**
   * Calls a method without expecting a return value (fire-and-forget).
   */
  void<T = any>(
    method: string,
    params?: MethodParams<T>,
    { http, httpFallback = true }: CallOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = { method, params }

      this.emit(ClientEvents.OUTBOUND_MESSAGE, payload)

      if (http || (!this.clientSocket.ready && httpFallback)) {
        const uuid = Presentation.uuid()
        const httpPayload = {
          type: PayloadType.METHOD,
          uuid,
          method,
          params,
          void: true,
        }
        return this.clientHttp.request(httpPayload, null, reject)
      }

      // Fire-and-forget: send without waiting for acknowledgment
      this.clientSocket.send('rpc:void', payload)

      resolve()
    })
  }

  private async waitForInitialization(timeout: number) {
    try {
      this.logger.connection(LogLevel.DEBUG, 'Waiting for initialization', {
        timeout,
      })
      await this.waitFor(ClientEvents.INITIALIZED, Math.floor(timeout / 2))
    } catch {
      throw new Error('TypeFerry: Client not initialized')
    }
  }

  /**
   * Executes a method call using WebSocket RPC or HTTP fallback.
   * Uses UUID-based request/response correlation.
   */
  private async executeCall<R>(
    method: string,
    params: any,
    http: boolean,
    httpFallback: boolean,
    timeout: number,
  ): Promise<R> {
    this.emit(ClientEvents.OUTBOUND_MESSAGE, { method, params })

    // HTTP path: used when http=true or socket not ready with fallback enabled
    if (http || (!this.clientSocket.ready && httpFallback)) {
      return new Promise((resolve, reject) => {
        const uuid = Presentation.uuid()
        const payload = { uuid, type: PayloadType.METHOD, method, params }
        this.clientHttp.request(payload, resolve, reject)
      })
    }

    // WebSocket path: use UUID-correlated RPC
    try {
      return await this.clientSocket.emitWithAck<R>(
        'rpc',
        { method, params },
        timeout,
      )
    } catch (error) {
      // Pass through errorHandler if configured
      if (this.errorHandler) {
        this.errorHandler(error as Error)
      }
      throw error
    }
  }

  private static readonly DEFAULT_CALL_OPTIONS = {
    timeout: 20000,
    http: undefined as boolean | undefined,
    httpFallback: true,
    ignoreInit: false,
    maxRetries: 0,
    delayBetweenRetriesMs: 3000,
  }

  private normalizeCallOptions(options?: CallOptions) {
    return { ...Client.DEFAULT_CALL_OPTIONS, ...options }
  }

  private async retryCall<R>(
    method: string,
    params: any,
    opts: ReturnType<typeof this.normalizeCallOptions>,
  ): Promise<R> {
    let lastError: any

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await this.executeCall<R>(
          method,
          params,
          opts.http,
          opts.httpFallback,
          opts.timeout,
        )
      } catch (error) {
        lastError = error
        if (attempt > 0) {
          this.logger.method(LogLevel.WARN, 'Method call retry failed', {
            method,
            attempt: attempt + 1,
            maxRetries: opts.maxRetries,
            error: (error as Error).message,
          })
        }
        if (attempt >= opts.maxRetries) throw lastError
        await new Promise(resolve =>
          setTimeout(resolve, opts.delayBetweenRetriesMs),
        )
      }
    }
  }

  async call<P = Record<string, any>, R = any>(
    method: string,
    params?: P,
    options?: CallOptions,
  ): Promise<R> {
    const opts = this.normalizeCallOptions(options)

    const shouldWaitForInit = !opts.ignoreInit && !this.initialized
    if (shouldWaitForInit) await this.waitForInitialization(opts.timeout)

    return this.retryCall<R>(method, params, opts)
  }

  typed<T extends ServerMethods>(types: T) {
    return this as any as Client<T>
  }

  combine<T extends Client>(methods: T) {
    return this as any as Client<InferClientMethods<T> & MethodsType>
  }

  /** Handles subscription events from the server. */
  handleEvent(payload: Presentation.Payload) {
    this.emit(ClientEvents.INBOUND_MESSAGE, payload)
    this.logger.channel(LogLevel.DEBUG, 'Event received', {
      channel: payload.channel,
      event: payload.event,
    })
    return this.channel(payload.channel).emit(payload.event, payload.params)
  }

  /**
   * Generates a URL path from string parts. The last argument can be a query
   * string object definition.
   */
  href(...path: (string | Record<string, any>)[]) {
    let queryString = ''

    if (isPlainObject(path.at(-1))) {
      const params = path.pop()
      queryString = '?'.concat(qs.stringify(params as any))
    }

    if (path.some(isPlainObject))
      throw new Error('Parameters are only allowed in the last argument.')

    return `${this.clientHttp.host}/${path
      .join('/')
      .replace(/^\/|\/{2,}/, '')}${queryString}`
  }

  channel(name: string | object = NO_CHANNEL) {
    if (
      name != null &&
      typeof name === 'object' &&
      name.constructor.name === 'ObjectId' &&
      typeof name.toString === 'function'
    ) {
      name = name.toString()
    }

    if (!name || typeof name !== 'string') return null
    if (name === NO_CHANNEL) return this

    const channelName = name as string

    if (this.channels.has(channelName)) return this.channels.get(channelName)

    const channel = new ClientChannel(channelName)
    channel.setClient(this)

    this.channels.set(channelName, channel)

    return channel
  }

  isConnected() {
    return new Promise(resolve => {
      if (this.connected) return resolve(true)

      this.once(ClientEvents.INITIALIZED, () => resolve(true))
    })
  }

  fetch(url: string, options: Record<string, unknown> = {}): Promise<Response> {
    return fetch(url, {
      credentials: 'include' as const,
      headers: {
        [TOKEN_HEADER_KEY]: this.context.token,
      },
      ...options,
    })
  }
}

export type InferClientMethods<T extends Client> = T['m']
