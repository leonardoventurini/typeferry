import type { ServerWebSocket, WebSocketHandler } from 'bun'

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
import type { BifrostSocket, ConnectionData } from '../types'
import { SocketState } from '../types'
import {
  authenticateNode,
  handleRpc,
  handleRpcVoid,
  parseMeta,
  PING_INTERVAL_MS,
  PING_PAYLOAD,
  validateUuid,
} from './ws-shared'

/**
 * Bun-native WebSocket transport for Bifrost.
 *
 * Replaces the `ws`-based WebSocketTransport with Bun.serve()'s built-in
 * WebSocket support. Upgrade happens in the `fetch` handler via
 * `server.upgrade()`, and message routing uses the global `websocket`
 * handler object.
 */
export class BunWebSocketTransport {
  server: Server
  rooms = new RoomRegistry()

  private path: string
  private origins: Set<string> | null
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(server: Server, origins?: string[]) {
    this.server = server
    this.path = BIFROST_WS_PATH
    this.origins = origins?.length ? new Set(origins) : null
  }

  /**
   * Returns the WebSocket handler config for `Bun.serve({ websocket })`.
   * Handlers are declared once per server — Bun routes connections
   * to these callbacks automatically after `server.upgrade()`.
   */
  getWebSocketHandlers(): WebSocketHandler<ConnectionData> {
    return {
      open: ws => this.handleOpen(ws),
      message: (ws, raw) => this.handleMessage(ws, raw),
      close: ws => this.handleClose(ws),
    }
  }

  /**
   * Attempts to upgrade an HTTP request to a WebSocket connection.
   * Called from BunHttpTransport's fetch handler.
   */
  handleUpgrade(
    req: Request,
    bunServer: {
      upgrade: (req: Request, opts: { data: ConnectionData }) => boolean
      requestIP: (req: Request) => { address: string } | null
    },
  ): boolean {
    const url = new URL(req.url)

    if (!this.shouldUpgrade(url, req)) return false

    const data = this.buildConnectionData(url, req, bunServer)
    return bunServer.upgrade(req, { data })
  }

  /** Starts the global ping interval for all connected clients. */
  startGlobalPing(): void {
    this.pingInterval = setInterval(() => {
      for (const [, node] of this.server.allClients) {
        if (node.socket?.readyState === SocketState.OPEN) {
          node.socket.send(PING_PAYLOAD)
        }
      }
    }, PING_INTERVAL_MS)
  }

  /** Gracefully closes all connections and stops the ping interval. */
  async close(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private shouldUpgrade(url: URL, req: Request): boolean {
    if (url.pathname !== this.path) return false
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return false
    if (!this.server.acceptConnections) return false
    return this.validateOrigin(req)
  }

  private buildConnectionData(
    url: URL,
    req: Request,
    bunServer: { requestIP: (req: Request) => { address: string } | null },
  ): ConnectionData {
    const ip = bunServer.requestIP(req)
    const forwarded = req.headers.get('x-forwarded-for')

    return {
      node: null,
      uuid: validateUuid(url.searchParams.get('uuid')),
      token: url.searchParams.get('token') ?? undefined,
      meta: parseMeta(url.searchParams.get('meta')),
      remoteAddress: forwarded ?? ip?.address ?? '127.0.0.1',
      userAgent: req.headers.get('user-agent') ?? '',
      headers: Object.fromEntries(req.headers.entries()),
    }
  }

  private validateOrigin(req: Request): boolean {
    if (!this.origins) return true
    const origin = req.headers.get('origin')
    if (!origin) return true
    return this.origins.has(origin)
  }

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle handlers
  // ---------------------------------------------------------------------------

  private handleOpen(ws: ServerWebSocket<ConnectionData>): void {
    const { uuid, meta, remoteAddress, userAgent, headers } = ws.data
    const socket = ws as unknown as BifrostSocket

    const node = new ClientNode(
      this.server,
      socket,
      undefined,
      undefined,
      this.server.rateLimit,
    )

    node.setId(uuid)
    node.meta = meta
    node.headers = headers
    node.userAgent = userAgent
    node.remoteAddress = remoteAddress

    ws.data.node = node

    this.server.addClient(node)
    this.server.emit(ServerEvents.CONNECTION, node)

    authenticateNode(this.server, node, ws.data.token)
  }

  private handleMessage(
    ws: ServerWebSocket<ConnectionData>,
    raw: string | Buffer,
  ): void {
    const node = ws.data.node
    if (!node) return

    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8')
      const msg = Presentation.decode<{ t: string }>(text)

      if (isRpcMessage(msg)) {
        handleRpc(this.server, node, msg.id, msg.method, msg.params)
      } else if (isRpcVoidMessage(msg)) {
        handleRpcVoid(this.server, node, msg.method, msg.params)
      } else if (isPongMessage(msg)) {
        // Bun handles transport-level keepalive via idleTimeout
      }
    } catch {
      // Malformed message — ignore
    }
  }

  private handleClose(ws: ServerWebSocket<ConnectionData>): void {
    const node = ws.data.node
    if (!node) return

    this.rooms.leaveAll(ws as unknown as BifrostSocket)
    node.close()
    this.server.deleteClient(node)
  }
}
