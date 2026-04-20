import type http from 'http'
import type { Duplex } from 'stream'
import type WebSocket from 'ws'
import { WebSocketServer } from 'ws'

import {
  BIFROST_WS_PATH,
  isPongMessage,
  isRpcMessage,
  isRpcVoidMessage,
  Presentation,
  ServerEvents,
} from '../../utils'
import { ClientNode } from '../client-node'
import { RoomRegistry } from '../room-registry'
import type { Server } from '../server'
import type { BifrostSocket } from '../types'
import { SocketState } from '../types'
import type { HttpTransport } from './http-transport'

import {
  PING_INTERVAL_MS,
  PING_PAYLOAD,
  authenticateNode,
  handleRpc,
  handleRpcVoid,
  parseMeta,
  validateUuid,
} from './ws-shared'

export enum WebSocketTransportEvents {
  WEBSOCKET_SERVER_ERROR = 'websocket:server:error',
}

export interface WebSocketTransportOptions {
  path?: string
  cors?: {
    credentials?: boolean
    origin?: string | string[]
  }
}

/**
 * WebSocket transport using the `ws` package (Node.js fallback).
 *
 * Used when running under vitest/Node where Bun.serve() is unavailable.
 * In production (Bun runtime), BunWebSocketTransport is used instead.
 */
export class WebSocketTransport {
  server: Server
  wss: WebSocketServer
  rooms = new RoomRegistry()

  private path: string
  private origins: Set<string> | null
  private pingTimers = new Map<BifrostSocket, ReturnType<typeof setInterval>>()
  private pongReceived = new Map<BifrostSocket, boolean>()

  constructor(
    server: Server,
    origins: string[],
    opts?: WebSocketTransportOptions,
  ) {
    this.server = server
    this.path = opts?.path ?? BIFROST_WS_PATH
    this.origins = origins?.length ? new Set(origins) : null

    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('error', (error: Error) =>
      server.emit(WebSocketTransportEvents.WEBSOCKET_SERVER_ERROR, error),
    )

    this.attachUpgradeHandler()
  }

  private attachUpgradeHandler(): void {
    const httpTransport = this.server.httpTransport as HttpTransport
    httpTransport.http.on(
      'upgrade',
      (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? '', 'http://localhost')

        if (url.pathname !== this.path) return

        if (!this.server.acceptConnections) {
          socket.destroy()
          return
        }

        if (!this.validateOrigin(req)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          socket.destroy()
          return
        }

        this.wss.handleUpgrade(req, socket, head, ws => {
          this.handleConnection(ws, req)
        })
      },
    )
  }

  private validateOrigin(req: http.IncomingMessage): boolean {
    if (!this.origins) return true
    const origin = req.headers.origin
    if (!origin) return true
    return this.origins.has(origin)
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url ?? '', 'http://localhost')

    const uuid = validateUuid(url.searchParams.get('uuid'))
    const token = url.searchParams.get('token') ?? undefined
    const meta = parseMeta(url.searchParams.get('meta'))

    const node = new ClientNode(
      this.server,
      ws,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setId(uuid)
    node.meta = meta
    node.setTrackingProperties(req)

    this.server.addClient(node)
    this.server.emit(ServerEvents.CONNECTION, node)

    ws.on('message', (raw: Buffer | string) => {
      this.handleMessage(node, raw)
    })

    ws.on('close', () => {
      this.stopPing(ws)
      this.rooms.leaveAll(ws)
      node.close()
      this.server.deleteClient(node)
    })

    ws.on('error', (error: Error) => {
      this.server.emit(ServerEvents.SOCKET_ERROR, ws, error)
    })

    this.startPing(ws)
    authenticateNode(this.server, node, token)
  }

  private handleMessage(node: ClientNode, raw: Buffer | string): void {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8')
      const msg = Presentation.decode<{ t: string }>(text)

      if (isRpcMessage(msg)) {
        handleRpc(this.server, node, msg.id, msg.method, msg.params)
      } else if (isRpcVoidMessage(msg)) {
        handleRpcVoid(this.server, node, msg.method, msg.params)
      } else if (isPongMessage(msg) && node.socket) {
        this.pongReceived.set(node.socket, true)
      }
    } catch {
      // Malformed message — ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Ping / Pong keep-alive
  // ---------------------------------------------------------------------------

  private startPing(ws: WebSocket): void {
    this.pongReceived.set(ws, true)

    const timer = setInterval(() => {
      if (!this.pongReceived.get(ws)) {
        ws.terminate()
        return
      }

      this.pongReceived.set(ws, false)

      if (ws.readyState === SocketState.OPEN) {
        ws.send(PING_PAYLOAD)
      }
    }, PING_INTERVAL_MS)

    this.pingTimers.set(ws, timer)

    ws.on('pong', () => {
      this.pongReceived.set(ws, true)
    })
  }

  private stopPing(ws: WebSocket): void {
    const timer = this.pingTimers.get(ws)
    if (timer) {
      clearInterval(timer)
      this.pingTimers.delete(ws)
    }
    this.pongReceived.delete(ws)
  }

  close(): Promise<void> {
    return new Promise<void>(resolve => {
      for (const [ws, timer] of this.pingTimers) {
        clearInterval(timer)
        if (ws.readyState === SocketState.OPEN) ws.close()
      }
      this.pingTimers.clear()
      this.pongReceived.clear()

      this.wss.close(() => resolve())
    })
  }
}
