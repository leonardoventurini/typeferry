import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./ws-shared', () => ({
  PING_INTERVAL_MS: 100,
  PING_PAYLOAD: '{"t":"ping"}',
  authenticateNode: vi.fn(),
  handleRpc: vi.fn(),
  handleRpcVoid: vi.fn(),
  parseMeta: vi.fn().mockReturnValue({ role: 'admin' }),
  validateUuid: vi.fn().mockReturnValue('validated-uuid'),
}))

vi.mock('../client-node', () => {
  return {
    ClientNode: class MockClientNode {
      setId = vi.fn()
      meta: Record<string, unknown> = {}
      headers: Record<string, string> = {}
      userAgent = ''
      remoteAddress = ''
      socket: unknown = null
      close = vi.fn()
      constructor(..._args: unknown[]) {}
    },
  }
})

vi.mock('../room-registry', () => {
  return {
    RoomRegistry: class MockRoomRegistry {
      leaveAll = vi.fn()
    },
  }
})

import { BunWebSocketTransport } from './bun-ws-transport'
import {
  authenticateNode,
  handleRpc,
  handleRpcVoid,
  PING_PAYLOAD,
} from './ws-shared'
import { ClientNode } from '../client-node'
import {
  Presentation,
  ServerEvents,
  MessageType,
  isRpcMessage,
  isRpcVoidMessage,
  isPongMessage,
} from '../../utils'
import { SocketState } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockServer(overrides: Record<string, unknown> = {}) {
  return {
    port: 3000,
    host: 'localhost',
    acceptConnections: true,
    allClients: new Map(),
    addClient: vi.fn(),
    deleteClient: vi.fn(),
    emit: vi.fn(),
    rateLimit: null,
    ...overrides,
  } as any
}

function createMockWs(data: Record<string, unknown> = {}) {
  return {
    data: {
      node: null,
      uuid: 'test-uuid',
      token: 'test-token',
      meta: {},
      remoteAddress: '127.0.0.1',
      userAgent: 'test-agent',
      headers: {},
      ...data,
    },
    send: vi.fn(),
    close: vi.fn(),
    readyState: SocketState.OPEN,
  } as any
}

function createRequest(
  path = '/bifrost-ws',
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
): Request {
  const url = new URL(`http://localhost:3000${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const h = new Headers({ upgrade: 'websocket', ...headers })
  return new Request(url.toString(), { headers: h })
}

function createBunServer() {
  return {
    upgrade: vi.fn().mockReturnValue(true),
    requestIP: vi.fn().mockReturnValue({ address: '10.0.0.1' }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BunWebSocketTransport', () => {
  let server: ReturnType<typeof createMockServer>
  let transport: BunWebSocketTransport

  beforeEach(() => {
    vi.useFakeTimers()
    server = createMockServer()
    transport = new BunWebSocketTransport(server)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('stores the server reference', () => {
      expect(transport.server).toBe(server)
    })

    it('creates a RoomRegistry', () => {
      expect(transport.rooms).toBeDefined()
      expect(transport.rooms.leaveAll).toBeDefined()
    })

    it('sets the default path to /bifrost-ws', () => {
      // We verify indirectly via handleUpgrade accepting the default path
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()
      transport.handleUpgrade(req, bunServer)
      expect(bunServer.upgrade).toHaveBeenCalled()
    })

    it('sets origins when provided', () => {
      const t = new BunWebSocketTransport(server, [
        'http://localhost:3000',
        'http://example.com',
      ])
      // Verify by checking that a matching origin passes
      const req = createRequest('/bifrost-ws', {
        origin: 'http://localhost:3000',
      })
      const bunServer = createBunServer()
      t.handleUpgrade(req, bunServer)
      expect(bunServer.upgrade).toHaveBeenCalled()
    })

    it('sets origins to null when empty array provided', () => {
      const t = new BunWebSocketTransport(server, [])
      // No origin restriction — any origin should pass
      const req = createRequest('/bifrost-ws', {
        origin: 'http://any-origin.com',
      })
      const bunServer = createBunServer()
      t.handleUpgrade(req, bunServer)
      expect(bunServer.upgrade).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // getWebSocketHandlers
  // -------------------------------------------------------------------------
  describe('getWebSocketHandlers', () => {
    it('returns an object with open, message, and close handlers', () => {
      const handlers = transport.getWebSocketHandlers()
      expect(handlers).toHaveProperty('open')
      expect(handlers).toHaveProperty('message')
      expect(handlers).toHaveProperty('close')
      expect(typeof handlers.open).toBe('function')
      expect(typeof handlers.message).toBe('function')
      expect(typeof handlers.close).toBe('function')
    })
  })

  // -------------------------------------------------------------------------
  // handleUpgrade / shouldUpgrade
  // -------------------------------------------------------------------------
  describe('handleUpgrade', () => {
    it('upgrades a valid request', () => {
      const req = createRequest('/bifrost-ws', {}, { uuid: 'abc' })
      const bunServer = createBunServer()

      const result = transport.handleUpgrade(req, bunServer)

      expect(result).toBe(true)
      expect(bunServer.upgrade).toHaveBeenCalledWith(req, {
        data: expect.objectContaining({
          node: null,
          uuid: 'validated-uuid',
        }),
      })
    })

    it('returns false for wrong path', () => {
      const req = createRequest('/wrong-path')
      const bunServer = createBunServer()
      expect(transport.handleUpgrade(req, bunServer)).toBe(false)
      expect(bunServer.upgrade).not.toHaveBeenCalled()
    })

    it('returns false when upgrade header is missing', () => {
      const url = new URL('http://localhost:3000/bifrost-ws')
      const req = new Request(url.toString()) // no upgrade header
      const bunServer = createBunServer()
      expect(transport.handleUpgrade(req, bunServer)).toBe(false)
    })

    it('returns false when upgrade header is not websocket', () => {
      const req = createRequest('/bifrost-ws', { upgrade: 'h2c' })
      const bunServer = createBunServer()
      expect(transport.handleUpgrade(req, bunServer)).toBe(false)
    })

    it('returns false when server is not accepting connections', () => {
      server.acceptConnections = false
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()
      expect(transport.handleUpgrade(req, bunServer)).toBe(false)
    })

    it('returns false for invalid origin', () => {
      const t = new BunWebSocketTransport(server, ['http://allowed.com'])
      const req = createRequest('/bifrost-ws', {
        origin: 'http://evil.com',
      })
      const bunServer = createBunServer()
      expect(t.handleUpgrade(req, bunServer)).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // validateOrigin
  // -------------------------------------------------------------------------
  describe('validateOrigin (via handleUpgrade)', () => {
    it('allows all origins when no origins configured', () => {
      const req = createRequest('/bifrost-ws', {
        origin: 'http://anything.com',
      })
      const bunServer = createBunServer()
      expect(transport.handleUpgrade(req, bunServer)).toBe(true)
    })

    it('allows matching origin', () => {
      const t = new BunWebSocketTransport(server, ['http://allowed.com'])
      const req = createRequest('/bifrost-ws', {
        origin: 'http://allowed.com',
      })
      const bunServer = createBunServer()
      expect(t.handleUpgrade(req, bunServer)).toBe(true)
    })

    it('rejects non-matching origin', () => {
      const t = new BunWebSocketTransport(server, ['http://allowed.com'])
      const req = createRequest('/bifrost-ws', {
        origin: 'http://blocked.com',
      })
      const bunServer = createBunServer()
      expect(t.handleUpgrade(req, bunServer)).toBe(false)
    })

    it('allows requests with no origin header', () => {
      const t = new BunWebSocketTransport(server, ['http://allowed.com'])
      // Request without an origin header
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()
      expect(t.handleUpgrade(req, bunServer)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // buildConnectionData
  // -------------------------------------------------------------------------
  describe('buildConnectionData (via handleUpgrade)', () => {
    it('extracts uuid and token from query params', () => {
      const req = createRequest(
        '/bifrost-ws',
        {},
        { uuid: 'my-uuid', token: 'my-token', meta: '{"key":"val"}' },
      )
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.uuid).toBe('validated-uuid') // from mocked validateUuid
      expect(data.token).toBe('my-token')
      expect(data.meta).toEqual({ role: 'admin' }) // from mocked parseMeta
    })

    it('uses x-forwarded-for when available', () => {
      const req = createRequest(
        '/bifrost-ws',
        { 'x-forwarded-for': '192.168.1.1' },
        {},
      )
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.remoteAddress).toBe('192.168.1.1')
    })

    it('falls back to requestIP when no forwarded header', () => {
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.remoteAddress).toBe('10.0.0.1')
    })

    it('falls back to 127.0.0.1 when requestIP returns null', () => {
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()
      bunServer.requestIP.mockReturnValue(null)

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.remoteAddress).toBe('127.0.0.1')
    })

    it('extracts user-agent from headers', () => {
      const req = createRequest(
        '/bifrost-ws',
        { 'user-agent': 'TestBrowser/1.0' },
        {},
      )
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.userAgent).toBe('TestBrowser/1.0')
    })

    it('sets empty userAgent when header missing', () => {
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      // user-agent not explicitly set; depends on Request default
      expect(typeof data.userAgent).toBe('string')
    })

    it('captures all request headers', () => {
      const req = createRequest(
        '/bifrost-ws',
        { 'x-custom': 'value123' },
        {},
      )
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.headers).toHaveProperty('x-custom', 'value123')
    })

    it('sets token to undefined when not present in query', () => {
      const req = createRequest('/bifrost-ws')
      const bunServer = createBunServer()

      transport.handleUpgrade(req, bunServer)

      const data = bunServer.upgrade.mock.calls[0][1].data
      expect(data.token).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // handleOpen
  // -------------------------------------------------------------------------
  describe('handleOpen', () => {
    it('creates a ClientNode and registers it', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()

      handlers.open!(ws)

      expect(server.addClient).toHaveBeenCalledTimes(1)
      const node = server.addClient.mock.calls[0][0]
      expect(node).toBeInstanceOf(ClientNode)
    })

    it('sets node properties from ws.data', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs({
        uuid: 'ws-uuid',
        meta: { x: 1 },
        remoteAddress: '10.0.0.5',
        userAgent: 'Bifrost/2.0',
        headers: { 'x-test': 'yes' },
      })

      handlers.open!(ws)

      const node = server.addClient.mock.calls[0][0]
      expect(node.setId).toHaveBeenCalledWith('ws-uuid')
      expect(node.meta).toEqual({ x: 1 })
      expect(node.remoteAddress).toBe('10.0.0.5')
      expect(node.userAgent).toBe('Bifrost/2.0')
      expect(node.headers).toEqual({ 'x-test': 'yes' })
    })

    it('sets ws.data.node to the created node', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()

      handlers.open!(ws)

      expect(ws.data.node).toBeInstanceOf(ClientNode)
    })

    it('emits CONNECTION event', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()

      handlers.open!(ws)

      expect(server.emit).toHaveBeenCalledWith(
        ServerEvents.CONNECTION,
        expect.any(ClientNode),
      )
    })

    it('calls authenticateNode with token', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs({ token: 'auth-token-123' })

      handlers.open!(ws)

      expect(authenticateNode).toHaveBeenCalledWith(
        server,
        expect.any(ClientNode),
        'auth-token-123',
      )
    })

    it('calls authenticateNode with undefined when no token', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()
      delete ws.data.token

      handlers.open!(ws)

      expect(authenticateNode).toHaveBeenCalledWith(
        server,
        expect.any(ClientNode),
        undefined,
      )
    })
  })

  // -------------------------------------------------------------------------
  // handleMessage
  // -------------------------------------------------------------------------
  describe('handleMessage', () => {
    let handlers: ReturnType<BunWebSocketTransport['getWebSocketHandlers']>
    let ws: ReturnType<typeof createMockWs>
    let mockNode: any

    beforeEach(() => {
      handlers = transport.getWebSocketHandlers()
      ws = createMockWs()
      // Simulate that handleOpen was called
      mockNode = new ClientNode(server as any)
      ws.data.node = mockNode
    })

    it('routes RPC messages to handleRpc', () => {
      const msg = { t: MessageType.RPC, id: '1', method: 'test', params: {} }
      const text = Presentation.encode(msg)

      handlers.message!(ws, text)

      expect(handleRpc).toHaveBeenCalledWith(
        server,
        mockNode,
        '1',
        'test',
        {},
      )
    })

    it('routes void RPC messages to handleRpcVoid', () => {
      const msg = {
        t: MessageType.RPC_VOID,
        method: 'fire',
        params: { x: 1 },
      }
      const text = Presentation.encode(msg)

      handlers.message!(ws, text)

      expect(handleRpcVoid).toHaveBeenCalledWith(
        server,
        mockNode,
        'fire',
        { x: 1 },
      )
    })

    it('ignores pong messages without error', () => {
      const msg = { t: MessageType.PONG }
      const text = Presentation.encode(msg)

      expect(() => handlers.message!(ws, text)).not.toThrow()
      expect(handleRpc).not.toHaveBeenCalled()
      expect(handleRpcVoid).not.toHaveBeenCalled()
    })

    it('handles Buffer input', () => {
      const msg = { t: MessageType.RPC, id: '2', method: 'bufTest', params: null }
      const text = Presentation.encode(msg)
      const buf = Buffer.from(text, 'utf8')

      handlers.message!(ws, buf)

      expect(handleRpc).toHaveBeenCalledWith(
        server,
        mockNode,
        '2',
        'bufTest',
        null,
      )
    })

    it('ignores malformed messages', () => {
      expect(() => handlers.message!(ws, 'not-valid-json{{')).not.toThrow()
      expect(handleRpc).not.toHaveBeenCalled()
    })

    it('ignores messages when node is null', () => {
      ws.data.node = null

      const msg = { t: MessageType.RPC, id: '1', method: 'test', params: {} }
      const text = Presentation.encode(msg)

      handlers.message!(ws, text)

      expect(handleRpc).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // handleClose
  // -------------------------------------------------------------------------
  describe('handleClose', () => {
    it('calls rooms.leaveAll, node.close, server.deleteClient', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()
      const mockNode = new ClientNode(server as any)
      ws.data.node = mockNode

      handlers.close!(ws)

      expect(transport.rooms.leaveAll).toHaveBeenCalledWith(ws)
      expect(mockNode.close).toHaveBeenCalled()
      expect(server.deleteClient).toHaveBeenCalledWith(mockNode)
    })

    it('does nothing when node is null', () => {
      const handlers = transport.getWebSocketHandlers()
      const ws = createMockWs()
      ws.data.node = null

      handlers.close!(ws)

      expect(transport.rooms.leaveAll).not.toHaveBeenCalled()
      expect(server.deleteClient).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // startGlobalPing
  // -------------------------------------------------------------------------
  describe('startGlobalPing', () => {
    it('sends PING_PAYLOAD to OPEN clients', () => {
      const mockSocket = { readyState: SocketState.OPEN, send: vi.fn() }
      const nodeA = { socket: mockSocket } as any
      server.allClients.set('a', nodeA)

      transport.startGlobalPing()
      vi.advanceTimersByTime(100)

      expect(mockSocket.send).toHaveBeenCalledWith(PING_PAYLOAD)
    })

    it('skips clients that are not OPEN', () => {
      const mockSocket = { readyState: SocketState.CLOSED, send: vi.fn() }
      const nodeA = { socket: mockSocket } as any
      server.allClients.set('a', nodeA)

      transport.startGlobalPing()
      vi.advanceTimersByTime(100)

      expect(mockSocket.send).not.toHaveBeenCalled()
    })

    it('skips clients with no socket', () => {
      const nodeA = { socket: null } as any
      server.allClients.set('a', nodeA)

      transport.startGlobalPing()
      vi.advanceTimersByTime(100)

      // Should not throw
    })

    it('sends pings on each interval tick', () => {
      const mockSocket = { readyState: SocketState.OPEN, send: vi.fn() }
      const nodeA = { socket: mockSocket } as any
      server.allClients.set('a', nodeA)

      transport.startGlobalPing()

      vi.advanceTimersByTime(100)
      expect(mockSocket.send).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      expect(mockSocket.send).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(100)
      expect(mockSocket.send).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------
  describe('close', () => {
    it('clears the ping interval', async () => {
      transport.startGlobalPing()
      const mockSocket = { readyState: SocketState.OPEN, send: vi.fn() }
      server.allClients.set('a', { socket: mockSocket } as any)

      await transport.close()

      vi.advanceTimersByTime(200)
      expect(mockSocket.send).not.toHaveBeenCalled()
    })

    it('handles close when no ping interval is running', async () => {
      // Should not throw
      await expect(transport.close()).resolves.toBeUndefined()
    })

    it('sets pingInterval to null after clearing', async () => {
      transport.startGlobalPing()
      await transport.close()

      // Calling close again should be a no-op (no double-clear)
      await expect(transport.close()).resolves.toBeUndefined()
    })
  })
})
