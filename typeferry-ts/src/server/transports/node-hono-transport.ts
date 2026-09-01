import { getConnInfo } from '@hono/node-server/conninfo'
import { getRequestListener, type HttpBindings } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import {
  createServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { PassThrough } from 'node:stream'

import { EJSON } from '../../ejson'
import {
  CLIENT_ID_HEADER_KEY,
  Errors,
  PayloadType,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
  TOKEN_HEADER_KEY,
} from '../../utils'
import { ClientNode } from '../client-node'
import { redactMethodTelemetry, type Method } from '../method'
import type { TypeFerryRequest, TypeFerryResponse } from '../request-types'
import type { RateLimit, Server } from '../server'
import { rateLimiter, type DisposableRateLimiter } from './hono-rate-limit'
import {
  HttpTransportEvents,
  SERVER_NOT_READY_RESPONSE,
} from './node-hono-transport-contract'

/**
 * Node.js HTTP transport backed by a Hono application.
 *
 * The adapter server is created without listening so the WebSocket transport
 * can attach its upgrade handler before the listener accepts traffic.
 */
export class NodeHonoTransport {
  server: Server
  app: Hono
  http?: NodeHttpServer
  private httpRateLimiter?: DisposableRateLimiter

  constructor(
    server: Server,
    origins: string[] | undefined,
    limit: RateLimit,
    maxRequestBodySize: number,
  ) {
    this.server = server
    this.app = new Hono()

    this.setupMiddleware(origins, limit, maxRequestBodySize)
    const honoListener = getRequestListener((request, env) =>
      this.handleFetch(request, env as HttpBindings),
    )
    this.http = createServer((request, response) => {
      if (!this.server.requestListener) {
        void honoListener(request, response)
        return
      }

      this.dispatchObservedRequest(request, response, honoListener)
    })
  }

  /**
   * Tees a request without allowing an optional observer to control Hono's
   * backpressure. Header-only observers receive metadata and completion without
   * buffering the body; body observers receive the same chunks synchronously.
   */
  private dispatchObservedRequest(
    request: IncomingMessage,
    response: ServerResponse,
    honoListener: ReturnType<typeof getRequestListener>,
  ): void {
    const honoRequest = this.createRequestMirror(request)
    const observerRequest = this.createRequestMirror(request)
    void honoListener(honoRequest, response)
    this.server.requestListener(observerRequest, response)

    request.on('data', (chunk: Buffer) => {
      if (!honoRequest.write(chunk)) request.pause()
      if (
        observerRequest.listenerCount('data') > 0 &&
        !observerRequest.destroyed
      ) {
        // Emit observational chunks synchronously without writing them into the
        // mirror's internal buffer. Pausing an observer therefore cannot retain
        // or backpressure the authoritative Hono body stream.
        observerRequest.emit('data', chunk)
      }
    })
    honoRequest.on('drain', () => request.resume())
    request.once('end', () => {
      honoRequest.end()
      observerRequest.end()
    })
    request.once('error', error => {
      honoRequest.destroy(error)
      observerRequest.destroy(error)
    })
  }

  /** Creates an IncomingMessage-compatible stream with immutable request metadata. */
  private createRequestMirror(
    request: IncomingMessage,
  ): PassThrough & IncomingMessage {
    const mirror = new PassThrough() as PassThrough & IncomingMessage
    Object.assign(mirror, {
      headers: request.headers,
      httpVersion: request.httpVersion,
      method: request.method,
      rawHeaders: request.rawHeaders,
      socket: request.socket,
      trailers: request.trailers,
      url: request.url,
    })
    return mirror
  }

  // ---------------------------------------------------------------------------
  // Middleware setup
  // ---------------------------------------------------------------------------

  private setupMiddleware(
    origins: string[] | undefined,
    limit: RateLimit,
    maxRequestBodySize: number,
  ): void {
    this.app.use(
      '*',
      bodyLimit({
        maxSize: maxRequestBodySize,
        onError: c => c.text('Request Entity Too Large', 413),
      }),
    )

    if (origins?.length) {
      this.app.use(
        '*',
        cors({
          origin: (origin: string) =>
            origins.includes(origin) ? origin : null,
          credentials: true,
        }),
      )
    }

    if (limit) {
      const opts =
        limit === true
          ? { windowMs: 60_000, max: 120 }
          : { windowMs: limit.interval, max: limit.max }
      this.httpRateLimiter = rateLimiter(opts)
      this.app.use('/__h', this.httpRateLimiter)
    }

    this.app.post('/__h', c => this.handleRpc(c))
  }

  // ---------------------------------------------------------------------------
  // Fetch handler
  // ---------------------------------------------------------------------------

  private handleFetch(
    req: Request,
    env: HttpBindings,
  ): Promise<Response> | Response {
    if (!this.server.acceptConnections) {
      return new Response(SERVER_NOT_READY_RESPONSE.body, {
        status: SERVER_NOT_READY_RESPONSE.status,
        headers: {
          'Retry-After': String(SERVER_NOT_READY_RESPONSE.retryAfterSeconds),
        },
      })
    }

    return this.app.fetch(req, env)
  }

  /** Starts the listener after all protocol transports have attached. */
  listen(onListening: () => void): void {
    this.http?.listen(this.server.port, this.server.host, () => {
      const address = this.http?.address() as AddressInfo | null | undefined
      if (address) this.server.port = address.port
      onListening()
    })
  }

  // ---------------------------------------------------------------------------
  // TypeFerry RPC handler
  // ---------------------------------------------------------------------------

  private async handleRpc(c: Context): Promise<Response> {
    const body = await c.req.text()
    const transport = this.parseTransport(body)

    if (!transport.payload) {
      return c.text(
        Presentation.encode({
          type: PayloadType.ERROR,
          message: Errors.INVALID_REQUEST,
        }),
      )
    }

    return this.dispatchRpc(c, {
      payload: transport.payload,
      context: transport.context,
    })
  }

  private async dispatchRpc(
    c: Context,
    transport: { payload: Record<string, unknown>; context: unknown },
  ): Promise<Response> {
    const { payload } = transport

    const method = this.server.getMethod(payload.method as string)
    if (!method) {
      return this.rpcError(c, Errors.METHOD_NOT_FOUND, {
        method: payload.method,
      })
    }

    const clientNode = await this.buildClientNode(c, transport.context)

    if (method.isProtected && !clientNode.authenticated) {
      return this.rpcError(c, Errors.METHOD_FORBIDDEN, {
        method: payload.method,
      })
    }

    try {
      const result = await method.exec(payload.params, clientNode)
      return this.rpcSuccess(c, result, payload)
    } catch (error) {
      return this.handleRpcError(c, error, payload, clientNode, method)
    }
  }

  // ---------------------------------------------------------------------------
  // Auth middleware (exposed for route files)
  // ---------------------------------------------------------------------------

  /** Hono middleware that requires authentication. Returns 403 on failure. */
  authMiddleware: MiddlewareHandler = async (c, next) => {
    const clientNode = this.buildClientNodeFromContext(c)
    const ctx = await this.getServerContext(clientNode)

    if (ctx === false) {
      return c.text('403 Forbidden', 403)
    }

    c.set('context', ctx)
    await next()
  }

  /** Hono middleware that loads context without requiring auth. */
  contextMiddleware: MiddlewareHandler = async (c, next) => {
    const clientNode = this.buildClientNodeFromContext(c)
    c.set('context', await this.getServerContext(clientNode))
    await next()
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildTypeFerryRequest(c: Context): TypeFerryRequest {
    return {
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      ip: c.req.header('x-forwarded-for') ?? getConnInfo(c).remote.address,
      path: c.req.path,
      get: (name: string) => c.req.header(name),
    }
  }

  private buildTypeFerryResponse(c: Context): TypeFerryResponse {
    return {
      setHeader: (name: string, value: string) => {
        c.header(name, value, {
          append: name.toLowerCase() === 'set-cookie',
        })
      },
    }
  }

  private buildClientNodeFromContext(c: Context): ClientNode {
    const req = this.buildTypeFerryRequest(c)
    const res = this.buildTypeFerryResponse(c)
    const node = new ClientNode(this.server, null, req, res)
    node.setTrackingProperties(req)
    return node
  }

  private async buildClientNode(
    c: Context,
    context: unknown,
  ): Promise<ClientNode> {
    const node = this.buildClientNodeFromContext(c)
    node.uuid = c.req.header(CLIENT_ID_HEADER_KEY) ?? ''
    const serverContext = await this.getServerContext(
      node,
      (context ?? {}) as Record<string, unknown>,
    )
    node.authenticated = Boolean(serverContext)
    node.setContext(serverContext)
    return node
  }

  private async getServerContext(
    clientNode: ClientNode,
    context: Record<string, unknown> = {},
  ): Promise<unknown> {
    const token = clientNode.req?.headers?.[TOKEN_HEADER_KEY] as
      string | undefined

    if (typeof token === 'string' && token.length && token !== 'undefined') {
      context.token = token.replace('Bearer ', '')
    }

    if (this.server.auth instanceof Function) {
      let result = this.server.auth.call(clientNode, context ?? {})
      result = result instanceof Promise ? await result : result
      return result
    }

    return false
  }

  private parseTransport(body: string): {
    payload?: Record<string, unknown>
    context: unknown
  } {
    if (!body) return { context: null }
    try {
      return EJSON.parse(body)
    } catch {
      return { context: null }
    }
  }

  private rpcError(
    c: Context,
    message: string,
    extra?: Record<string, unknown>,
  ): Response {
    const payload: Record<string, unknown> = {
      type: PayloadType.ERROR,
      message,
      ...extra,
    }
    return c.text(Presentation.encode(payload))
  }

  private rpcSuccess(
    c: Context,
    result: unknown,
    payload: Record<string, unknown>,
  ): Response {
    return c.text(
      Presentation.encode({
        type: PayloadType.RESULT,
        uuid: payload.uuid,
        method: payload.method,
        result,
      }),
    )
  }

  private handleRpcError(
    c: Context,
    error: unknown,
    payload: Record<string, unknown>,
    clientNode: ClientNode,
    method: Method<any, any>,
  ): Response {
    if (error instanceof PublicError) {
      if (payload.void) return c.text('', 200)

      return this.rpcError(
        c,
        error.message,
        payload.uuid ? { uuid: payload.uuid } : undefined,
      )
    }

    if (method.isSensitive) {
      console.error(
        `[TypeFerry] Sensitive method "${String(payload.method)}" failed`,
      )
    } else {
      console.error(error)
    }

    this.server.emit(ServerEvents.METHOD_ERROR, {
      error: redactMethodTelemetry(method, error),
      method: payload.method,
      params: redactMethodTelemetry(method, payload.params),
      userId: clientNode.userId,
      userEmail: clientNode.context?.user?.email,
      remoteAddress: clientNode.remoteAddress,
      userAgent: clientNode.userAgent,
    })

    if (payload.void) return c.text('', 200)

    if (error instanceof SchemaValidationError) {
      const p: Record<string, unknown> = {
        type: PayloadType.ERROR,
        message: error.message,
        errors: error.errors,
      }
      if (payload.uuid) p.uuid = payload.uuid
      return c.text(Presentation.encode(p))
    }

    return this.rpcError(
      c,
      Errors.INTERNAL_ERROR,
      payload.uuid ? { uuid: payload.uuid } : undefined,
    )
  }

  /** Registers a static root and optional single-page application fallback. */
  static(path: string, catchAll: boolean): void {
    this.app.use('*', serveStatic({ root: path }))
    if (catchAll) {
      this.app.get('*', serveStatic({ path: `${path}/index.html` }))
    }
  }

  async close(): Promise<void> {
    this.httpRateLimiter?.close()
    this.httpRateLimiter = undefined

    const http = this.http
    this.http = undefined
    if (!http) {
      this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
      return
    }

    http.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      http.close(error => {
        if (
          error &&
          (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
        ) {
          reject(error)
          return
        }
        http.unref()
        resolve()
      })
    })
    this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
  }
}
