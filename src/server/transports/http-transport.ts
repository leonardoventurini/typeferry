import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import http from 'http'

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
import type { RateLimit, Server } from '../server'

declare module 'express' {
  interface Request {
    context?: Record<string, any>
  }
}

export enum HttpTransportEvents {
  HTTP_LISTENING = 'http:listening',
  HTTP_SERVER_ERROR = 'http:server:error',
  HTTP_SERVER_CLOSED = 'http:server:closed',
}

export type RequestTransport = {
  context: any
  payload?: Record<string, any>
}

export class HttpTransport {
  server: Server
  http: http.Server
  express: express.Express

  constructor(server: Server, origins: string[], limit: RateLimit) {
    this.server = server
    this.express = express()
    this.http = http.createServer(this.express)

    this.express.use('/__h', express.urlencoded({ extended: true }))
    this.express.use('/__h', express.text({ type: 'text/plain' }))

    if (limit) {
      const limiter = rateLimit({
        ...(limit === true
          ? { windowMs: 60 * 1000, max: 120 }
          : { windowMs: limit.interval, max: limit.max }),
        standardHeaders: true,
        legacyHeaders: false,
      })

      this.express.use('/__h', limiter)
    }

    if (origins) this.setCORS(origins)

    if (this.server.requestListener) {
      this.http.on(ServerEvents.REQUEST, this.server.requestListener)
    }

    this.express.post('/__h', this.requestHandler)

    this.authMiddleware = this.authMiddleware.bind(this)
    this.contextMiddleware = this.contextMiddleware.bind(this)
  }

  setCORS(origins: string[]) {
    this.express.use(
      cors({
        credentials: true,
        origin: function (
          origin: string | undefined,
          callback: (err: Error | null, result?: boolean) => void,
        ) {
          if (!origin || origins.includes(origin)) return callback(null, true)

          callback(new Error('Not allowed by CORS'))
        },
      }),
    )
  }

  async getServerContext(clientNode: ClientNode, context: any = {}) {
    const token = clientNode.req.headers[TOKEN_HEADER_KEY] as string

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

  private sendError(res: express.Response, message: string, extra?: object) {
    return res.send(
      Presentation.encode({ type: PayloadType.ERROR, message, ...extra }),
    )
  }

  private handleRequestError(
    res: express.Response,
    error: any,
    isVoid: boolean,
    uuid: object | null,
    context?: {
      method?: string
      params?: unknown
      userId?: string
      userEmail?: string
      remoteAddress?: string | string[]
      userAgent?: string
    },
  ) {
    console.error(error)

    if (context?.method) {
      this.server.emit(ServerEvents.METHOD_ERROR, {
        error,
        method: context.method,
        params: context.params,
        userId: context.userId,
        userEmail: context.userEmail,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      })
    }

    if (isVoid) return

    if (error instanceof PublicError) {
      return this.sendError(res, error.message, uuid)
    }

    if (error instanceof SchemaValidationError) {
      return this.sendError(res, error.message, {
        errors: error.errors,
        ...uuid,
      })
    }

    return this.sendError(res, Errors.INTERNAL_ERROR, uuid)
  }

  private parseTransport(body: any): RequestTransport {
    return body && typeof body === 'string'
      ? EJSON.parse(body)
      : { context: null }
  }

  private async createAuthenticatedClient(
    req: express.Request,
    res: express.Response,
    context: any,
  ) {
    const clientNode = new ClientNode(this.server, null, req, res)
    clientNode.uuid = req.headers[CLIENT_ID_HEADER_KEY] as string
    clientNode.setTrackingProperties(req)
    const serverContext = await this.getServerContext(clientNode, context)
    clientNode.authenticated = Boolean(serverContext)
    clientNode.setContext(serverContext)
    return clientNode
  }

  private buildErrorContext(
    payload?: Record<string, unknown>,
    clientNode?: ClientNode,
  ): {
    method?: string
    params?: unknown
    userId?: string
    userEmail?: string
    remoteAddress?: string | string[]
    userAgent?: string
  } {
    return {
      method: payload?.method as string | undefined,
      params: payload?.params,
      userId: clientNode?.userId,
      userEmail: clientNode?.context?.user?.email,
      remoteAddress: clientNode?.remoteAddress,
      userAgent: clientNode?.userAgent,
    }
  }

  requestHandler = async (req: express.Request, res: express.Response) => {
    let uuid: object | null = null
    let payload: Record<string, any> | undefined
    let clientNode: ClientNode | undefined

    try {
      const transport = this.parseTransport(req.body)
      if (!transport.payload) return this.sendError(res, Errors.INVALID_REQUEST)

      payload = transport.payload
      uuid = payload?.uuid ? { uuid: payload.uuid } : null

      const method = this.server.getMethod(payload.method)
      if (!method)
        return this.sendError(res, Errors.METHOD_NOT_FOUND, {
          method: payload.method,
        })

      clientNode = await this.createAuthenticatedClient(
        req,
        res,
        transport.context,
      )

      if (method.isProtected && !clientNode.authenticated) {
        return this.sendError(res, Errors.METHOD_FORBIDDEN, {
          method: payload.method,
        })
      }

      const result = await method.exec(payload.params, clientNode)

      res.send(
        Presentation.encode({
          type: PayloadType.RESULT,
          uuid: payload.uuid,
          method: payload.method,
          result,
        }),
      )
    } catch (error) {
      this.handleRequestError(
        res,
        error,
        payload?.void,
        uuid,
        this.buildErrorContext(payload, clientNode),
      )
    }
  }

  async contextMiddleware(req, res, next) {
    const clientNode = new ClientNode(this.server, null, req, res)

    req.context = await this.getServerContext(clientNode)

    next()
  }

  async authMiddleware(req, res, next) {
    const clientNode = new ClientNode(this.server, null, req, res)

    const serverContext = await this.getServerContext(clientNode)

    if (serverContext === false) {
      res.status(403)

      return res.end('403 Forbidden')
    }

    req.context = serverContext

    next()
  }

  static(path: string, catchAll: boolean) {
    const middleware = express.static(path)

    this.express.use('/', middleware)

    if (catchAll) {
      this.express.use(/(.*)/, middleware)
    }
  }

  /**
   * Need to close WebSocket server first.
   */
  close() {
    return new Promise<void>(resolve => {
      if (!this.http) {
        this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
        return resolve()
      }

      // Capture reference to avoid race conditions if close() is called multiple times
      const http = this.http
      this.http = undefined

      http.closeAllConnections()

      http.close(() => {
        http.unref()
        this.server.emit(HttpTransportEvents.HTTP_SERVER_CLOSED)
        resolve()
      })
    })
  }
}
