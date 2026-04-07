/* eslint-disable no-undef -- Bun global is available at runtime */
import type { Server as BunServer } from 'bun'
import type { Context, MiddlewareHandler } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

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
import type { BifrostRequest, BifrostResponse } from '../request-types'
import type { RateLimit, Server } from '../server'
import type { ConnectionData } from '../types'
import type { BunWebSocketTransport } from './bun-ws-transport'
import { rateLimiter } from './hono-rate-limit'
import { HttpTransportEvents } from './http-transport'

/**
 * Bun-native HTTP transport using Hono instead of Express.
 *
 * Eliminates the Express-to-Bun bridge entirely — Hono speaks
 * `Request`/`Response` natively, so `Bun.serve({ fetch: app.fetch })`
 * works directly.
 */
export class BunHonoTransport {
  server: Server
  app: Hono

  bunServer: BunServer<ConnectionData>

  private wsTransport: BunWebSocketTransport

  constructor(
    server: Server,
    origins: string[],
    limit: RateLimit,
    wsTransport: BunWebSocketTransport,
  ) {
    this.server = server
    this.wsTransport = wsTransport
    this.app = new Hono()

    this.setupMiddleware(origins, limit)

    this.bunServer = Bun.serve({
      port: server.port,
      hostname: server.host,
      fetch: (req, bunSrv) => this.handleFetch(req, bunSrv),
      websocket: wsTransport.getWebSocketHandlers(),
      idleTimeout: 60,
    })

    server.port = this.bunServer.port
    wsTransport.startGlobalPing()
    setTimeout(() => server.emit(ServerEvents.HTTP_LISTENING), 0)
  }

  // ---------------------------------------------------------------------------
  // Middleware setup
  // ---------------------------------------------------------------------------

  private setupMiddleware(origins: string[], limit: RateLimit): void {
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
      this.app.use('/__h', rateLimiter(opts))
    }

    this.app.post('/__h', c => this.handleRpc(c))
  }

  // ---------------------------------------------------------------------------
  // Fetch handler
  // ---------------------------------------------------------------------------

  private handleFetch(
    req: Request,
    bunSrv: BunServer<ConnectionData>,
  ): Promise<Response> | Response | undefined {
    if (this.wsTransport.handleUpgrade(req, bunSrv)) {
      return undefined
    }

    return this.app.fetch(req, { ip: bunSrv.requestIP(req)?.address })
  }

  // ---------------------------------------------------------------------------
  // Bifrost RPC handler (replaces Express POST /__h)
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
      return this.rpcError(c, Errors.METHOD_NOT_FOUND, payload.uuid)
    }

    const clientNode = await this.buildClientNode(c, transport.context)

    if (method.isProtected && !clientNode.authenticated) {
      return this.rpcError(c, Errors.METHOD_FORBIDDEN, payload.uuid)
    }

    try {
      const result = await method.exec(payload.params, clientNode)
      return this.rpcSuccess(c, result, payload, clientNode)
    } catch (error) {
      return this.handleRpcError(c, error, payload, clientNode)
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

  private buildBifrostRequest(c: Context): BifrostRequest {
    return {
      headers: Object.fromEntries(c.req.raw.headers.entries()),
      ip:
        (c.env as Record<string, string>)?.ip ??
        c.req.header('x-forwarded-for'),
      get: (name: string) => c.req.header(name),
    }
  }

  private buildBifrostResponse(c: Context): BifrostResponse {
    return {
      setHeader: (name: string, value: string) => c.header(name, value),
    }
  }

  private buildClientNodeFromContext(c: Context): ClientNode {
    const req = this.buildBifrostRequest(c)
    const res = this.buildBifrostResponse(c)
    const node = new ClientNode(this.server, undefined, req, res)
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
      | string
      | undefined

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

  private rpcError(c: Context, message: string, uuid?: unknown): Response {
    const payload: Record<string, unknown> = {
      type: PayloadType.ERROR,
      message,
    }
    if (uuid) payload.uuid = uuid
    return c.text(Presentation.encode(payload))
  }

  private rpcSuccess(
    c: Context,
    result: unknown,
    payload: Record<string, unknown>,
    clientNode: ClientNode,
  ): Response {
    // Apply any pending response headers (e.g., Set-Cookie from auth)
    const res = clientNode.res as BifrostResponse & {
      _pending?: [string, string][]
    }
    if (res?._pending) {
      for (const [k, v] of res._pending) c.header(k, v, { append: true })
    }

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
  ): Response {
    console.error(error)

    this.server.emit(ServerEvents.METHOD_ERROR, {
      error,
      method: payload.method,
      params: payload.params,
      userId: clientNode.userId,
      userEmail: clientNode.context?.user?.email,
      remoteAddress: clientNode.remoteAddress,
      userAgent: clientNode.userAgent,
    })

    if (payload.void) return c.text('', 200)

    if (error instanceof PublicError) {
      return this.rpcError(c, error.message, payload.uuid)
    }

    if (error instanceof SchemaValidationError) {
      const p: Record<string, unknown> = {
        type: PayloadType.ERROR,
        message: error.message,
        errors: error.errors,
      }
      if (payload.uuid) p.uuid = payload.uuid
      return c.text(Presentation.encode(p))
    }

    return this.rpcError(c, Errors.INTERNAL_ERROR, payload.uuid)
  }

  /** Static file serving — noop here; use serveStatic from hono/bun in routes. */
  static(_path: string, _catchAll: boolean): void {
    // Hono uses serveStatic middleware registered on the app directly
  }

  async close(): Promise<void> {
    this.bunServer.stop(true)
    this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
  }
}
