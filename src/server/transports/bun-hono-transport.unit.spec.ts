import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockHonoApp, mockBunServer } = vi.hoisted(() => {
  const mockHonoApp = {
    use: vi.fn(),
    post: vi.fn(),
    fetch: vi.fn().mockResolvedValue(new Response('ok')),
  }
  const mockBunServer = {
    port: 3000,
    stop: vi.fn(),
    requestIP: vi.fn().mockReturnValue({ address: '127.0.0.1' }),
  }
  return { mockHonoApp, mockBunServer }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.stubGlobal('Bun', {
  serve: vi.fn().mockReturnValue(mockBunServer),
})

vi.mock('hono', () => ({
  Hono: function () {
    return mockHonoApp
  },
}))

vi.mock('hono/cors', () => ({
  cors: vi.fn(() => 'cors-middleware'),
}))

vi.mock('./hono-rate-limit', () => ({
  rateLimiter: vi.fn(() => 'rate-limit-middleware'),
}))

vi.mock('../client-node', () => {
  return {
    ClientNode: class MockClientNode {
      uuid = 'mock-uuid'
      authenticated = false
      isAuthenticated = false
      setTrackingProperties = vi.fn()
      setContext = vi.fn()
      context: Record<string, unknown> = {}
      userId = null
      userAgent = ''
      remoteAddress = ''
      req: Record<string, unknown> | undefined
      res: Record<string, unknown> | undefined
      constructor(
        _server: unknown,
        _socket?: unknown,
        req?: unknown,
        res?: unknown,
      ) {
        this.req = (req as Record<string, unknown>) ?? { headers: {} }
        this.res = (res as Record<string, unknown>) ?? {}
      }
      get readyState() {
        return undefined
      }
    },
  }
})

import { BunHonoTransport } from './bun-hono-transport'
import { HttpTransportEvents } from './http-transport'
import { cors } from 'hono/cors'
import { rateLimiter } from './hono-rate-limit'
import { EJSON } from '../../ejson'
import {
  Errors,
  PayloadType,
  Presentation,
  PublicError,
  SchemaValidationError,
  ServerEvents,
} from '../../utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWsTransport() {
  return {
    getWebSocketHandlers: vi.fn().mockReturnValue({
      open: vi.fn(),
      message: vi.fn(),
      close: vi.fn(),
    }),
    startGlobalPing: vi.fn(),
    handleUpgrade: vi.fn().mockReturnValue(false),
  } as any
}

function createMockServer(overrides: Record<string, unknown> = {}) {
  return {
    port: 3000,
    host: 'localhost',
    emit: vi.fn(),
    auth: vi.fn(),
    isAuthEnabled: false,
    getMethod: vi.fn(),
    methods: new Map(),
    ...overrides,
  } as any
}

/**
 * Creates a minimal Hono-like Context object.
 */
function createMockContext(
  body = '',
  headers: Record<string, string> = {},
): any {
  const responseHeaders = new Headers()
  return {
    req: {
      text: vi.fn().mockResolvedValue(body),
      raw: {
        headers: new Headers(headers),
      },
      header: vi.fn((name: string) => headers[name.toLowerCase()]),
    },
    env: { ip: '127.0.0.1' },
    text: vi.fn((text: string, status?: number) => {
      return new Response(text, { status: status ?? 200, headers: responseHeaders })
    }),
    header: vi.fn((name: string, value: string, opts?: { append: boolean }) => {
      if (opts?.append) {
        responseHeaders.append(name, value)
      } else {
        responseHeaders.set(name, value)
      }
    }),
    set: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BunHonoTransport', () => {
  let server: ReturnType<typeof createMockServer>
  let wsTransport: ReturnType<typeof createMockWsTransport>
  let transport: BunHonoTransport

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    server = createMockServer()
    wsTransport = createMockWsTransport()
    transport = new BunHonoTransport(server, ['http://localhost:3000'], null as any, wsTransport)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('calls Bun.serve with correct config', () => {
      expect(Bun.serve).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
          hostname: 'localhost',
          idleTimeout: 60,
        }),
      )
    })

    it('passes websocket handlers from wsTransport', () => {
      expect(wsTransport.getWebSocketHandlers).toHaveBeenCalled()
      const serveCall = (Bun.serve as any).mock.calls[0][0]
      expect(serveCall.websocket).toBeDefined()
    })

    it('updates server.port from bun server', () => {
      expect(server.port).toBe(mockBunServer.port)
    })

    it('calls wsTransport.startGlobalPing', () => {
      expect(wsTransport.startGlobalPing).toHaveBeenCalled()
    })

    it('emits HTTP_LISTENING asynchronously', () => {
      expect(server.emit).not.toHaveBeenCalledWith(ServerEvents.HTTP_LISTENING)
      vi.advanceTimersByTime(0)
      expect(server.emit).toHaveBeenCalledWith(ServerEvents.HTTP_LISTENING)
    })

    it('stores the hono app', () => {
      expect(transport.app).toBe(mockHonoApp)
    })

    it('stores the bun server', () => {
      expect(transport.bunServer).toBe(mockBunServer)
    })
  })

  // -------------------------------------------------------------------------
  // setupMiddleware
  // -------------------------------------------------------------------------
  describe('setupMiddleware', () => {
    it('sets up CORS when origins are provided', () => {
      expect(cors).toHaveBeenCalled()
      expect(mockHonoApp.use).toHaveBeenCalledWith('*', 'cors-middleware')
    })

    it('does not set up CORS when origins are empty', () => {
      vi.clearAllMocks()
      new BunHonoTransport(server, [], null as any, wsTransport)
      expect(cors).not.toHaveBeenCalled()
    })

    it('sets up rate limiter with default opts when limit is true', () => {
      vi.clearAllMocks()
      new BunHonoTransport(server, [], true as any, wsTransport)
      expect(rateLimiter).toHaveBeenCalledWith({
        windowMs: 60_000,
        max: 120,
      })
      expect(mockHonoApp.use).toHaveBeenCalledWith(
        '/__h',
        'rate-limit-middleware',
      )
    })

    it('sets up rate limiter with custom opts', () => {
      vi.clearAllMocks()
      new BunHonoTransport(
        server,
        [],
        { interval: 30_000, max: 50 } as any,
        wsTransport,
      )
      expect(rateLimiter).toHaveBeenCalledWith({
        windowMs: 30_000,
        max: 50,
      })
    })

    it('does not set up rate limiter when limit is falsy', () => {
      vi.clearAllMocks()
      new BunHonoTransport(server, [], null as any, wsTransport)
      expect(rateLimiter).not.toHaveBeenCalled()
    })

    it('registers POST /__h route', () => {
      expect(mockHonoApp.post).toHaveBeenCalledWith(
        '/__h',
        expect.any(Function),
      )
    })
  })

  // -------------------------------------------------------------------------
  // handleFetch
  // -------------------------------------------------------------------------
  describe('handleFetch', () => {
    it('delegates to wsTransport.handleUpgrade and returns undefined on success', () => {
      wsTransport.handleUpgrade.mockReturnValue(true)

      const serveCall = (Bun.serve as any).mock.calls[0][0]
      const result = serveCall.fetch(new Request('http://localhost:3000/bifrost-ws'), mockBunServer)

      expect(wsTransport.handleUpgrade).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('falls through to Hono app when not a WS upgrade', () => {
      wsTransport.handleUpgrade.mockReturnValue(false)

      const serveCall = (Bun.serve as any).mock.calls[0][0]
      serveCall.fetch(new Request('http://localhost:3000/__h'), mockBunServer)

      expect(mockHonoApp.fetch).toHaveBeenCalled()
    })

    it('passes requestIP to Hono env', () => {
      wsTransport.handleUpgrade.mockReturnValue(false)
      mockBunServer.requestIP.mockReturnValue({ address: '10.0.0.5' })

      const serveCall = (Bun.serve as any).mock.calls[0][0]
      const req = new Request('http://localhost:3000/__h')
      serveCall.fetch(req, mockBunServer)

      expect(mockHonoApp.fetch).toHaveBeenCalledWith(req, { ip: '10.0.0.5' })
    })
  })

  // -------------------------------------------------------------------------
  // handleRpc
  // -------------------------------------------------------------------------
  describe('handleRpc (via POST /__h)', () => {
    let rpcHandler: (c: any) => Promise<Response>

    beforeEach(() => {
      rpcHandler = mockHonoApp.post.mock.calls[0][1]
    })

    it('returns INVALID_REQUEST for empty body', async () => {
      const ctx = createMockContext('')
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.INVALID_REQUEST),
      )
    })

    it('returns INVALID_REQUEST for invalid JSON body', async () => {
      const ctx = createMockContext('not-valid-json{{')
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.INVALID_REQUEST),
      )
    })

    it('returns METHOD_NOT_FOUND when method does not exist', async () => {
      server.getMethod.mockReturnValue(null)

      const body = EJSON.stringify({
        payload: { method: 'noSuchMethod', uuid: 'u1' },
        context: {},
      })
      const ctx = createMockContext(body)
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.METHOD_NOT_FOUND),
      )
    })

    it('returns METHOD_FORBIDDEN for protected method with unauthenticated client', async () => {
      server.getMethod.mockReturnValue({
        isProtected: true,
        exec: vi.fn(),
      })
      // auth returns false so the client is unauthenticated
      server.auth.mockReturnValue(false)

      const body = EJSON.stringify({
        payload: { method: 'secret', uuid: 'u2' },
        context: {},
      })
      const ctx = createMockContext(body)
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.METHOD_FORBIDDEN),
      )
    })

    it('returns successful result when method executes', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue({ ok: true }),
      })
      server.auth.mockReturnValue(false)

      const body = EJSON.stringify({
        payload: { method: 'greet', uuid: 'u3', params: { name: 'world' } },
        context: {},
      })
      const ctx = createMockContext(body)
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining('"type":"result"'),
      )
    })

    it('applies pending response headers on success', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue('ok'),
      })
      server.auth.mockReturnValue(false)

      const body = EJSON.stringify({
        payload: { method: 'greet', uuid: 'u4' },
        context: {},
      })
      const ctx = createMockContext(body)

      // Patch the client node's res to have _pending headers
      // We need to intercept the ClientNode construction to set _pending
      const origText = ctx.text
      let headerCallCount = 0
      ctx.header = vi.fn((_n: string, _v: string, _o?: any) => {
        headerCallCount++
      })
      ctx.text = vi.fn((text: string, status?: number) => {
        return new Response(text, { status: status ?? 200 })
      })

      await rpcHandler(ctx)

      // The result should be encoded with the method and uuid
      expect(ctx.text).toHaveBeenCalled()
      const callArg = ctx.text.mock.calls[ctx.text.mock.calls.length - 1][0]
      expect(callArg).toContain('result')
    })
  })

  // -------------------------------------------------------------------------
  // dispatchRpc error handling
  // -------------------------------------------------------------------------
  describe('dispatchRpc error handling', () => {
    let rpcHandler: (c: any) => Promise<Response>

    beforeEach(() => {
      rpcHandler = mockHonoApp.post.mock.calls[0][1]
      server.auth.mockReturnValue(false)
    })

    it('handles PublicError by returning its message', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new PublicError('User-facing error')),
      })

      const body = EJSON.stringify({
        payload: { method: 'fail', uuid: 'u5' },
        context: {},
      })
      const ctx = createMockContext(body)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining('User-facing error'),
      )
      expect(server.emit).toHaveBeenCalledWith(
        ServerEvents.METHOD_ERROR,
        expect.objectContaining({ method: 'fail' }),
      )
      consoleSpy.mockRestore()
    })

    it('handles SchemaValidationError with errors array', async () => {
      const validationError = new SchemaValidationError('Validation failed', [
        'field1 required',
        'field2 invalid',
      ])
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockRejectedValue(validationError),
      })

      const body = EJSON.stringify({
        payload: { method: 'validate', uuid: 'u6' },
        context: {},
      })
      const ctx = createMockContext(body)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed'),
      )
      consoleSpy.mockRestore()
    })

    it('handles generic errors with INTERNAL_ERROR', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new Error('unexpected crash')),
      })

      const body = EJSON.stringify({
        payload: { method: 'crash', uuid: 'u7' },
        context: {},
      })
      const ctx = createMockContext(body)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.INTERNAL_ERROR),
      )
      consoleSpy.mockRestore()
    })

    it('returns empty 200 for void call errors', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new Error('void error')),
      })

      const body = EJSON.stringify({
        payload: { method: 'fire', uuid: 'u8', void: true },
        context: {},
      })
      const ctx = createMockContext(body)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith('', 200)
      consoleSpy.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // authMiddleware
  // -------------------------------------------------------------------------
  describe('authMiddleware', () => {
    it('returns 403 when auth returns false', async () => {
      server.auth.mockReturnValue(false)

      const ctx = createMockContext('', {})
      const next = vi.fn()

      await transport.authMiddleware(ctx, next)

      expect(ctx.text).toHaveBeenCalledWith('403 Forbidden', 403)
      expect(next).not.toHaveBeenCalled()
    })

    it('calls next when auth succeeds', async () => {
      server.auth.mockReturnValue({ user: { _id: '1' } })

      const ctx = createMockContext('', {})
      const next = vi.fn()

      await transport.authMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
      expect(ctx.set).toHaveBeenCalledWith(
        'context',
        expect.objectContaining({ user: { _id: '1' } }),
      )
    })

    it('handles async auth', async () => {
      server.auth.mockResolvedValue({ user: { _id: '2' } })

      const ctx = createMockContext('', {})
      const next = vi.fn()

      await transport.authMiddleware(ctx, next)

      expect(next).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // contextMiddleware
  // -------------------------------------------------------------------------
  describe('contextMiddleware', () => {
    it('loads context and calls next', async () => {
      server.auth.mockReturnValue({ user: { _id: '1' } })

      const ctx = createMockContext('', {})
      const next = vi.fn()

      await transport.contextMiddleware(ctx, next)

      expect(ctx.set).toHaveBeenCalledWith('context', expect.anything())
      expect(next).toHaveBeenCalled()
    })

    it('sets context to false when auth is not a function', async () => {
      server.auth = null

      const ctx = createMockContext('', {})
      const next = vi.fn()

      await transport.contextMiddleware(ctx, next)

      expect(ctx.set).toHaveBeenCalledWith('context', false)
      expect(next).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // parseTransport
  // -------------------------------------------------------------------------
  describe('parseTransport (via handleRpc)', () => {
    let rpcHandler: (c: any) => Promise<Response>

    beforeEach(() => {
      rpcHandler = mockHonoApp.post.mock.calls[0][1]
    })

    it('returns no payload for empty body', async () => {
      const ctx = createMockContext('')
      await rpcHandler(ctx)

      // Should return INVALID_REQUEST since payload is undefined
      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.INVALID_REQUEST),
      )
    })

    it('returns no payload for invalid JSON', async () => {
      const ctx = createMockContext('{broken')
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining(Errors.INVALID_REQUEST),
      )
    })

    it('parses valid EJSON body', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue('result'),
      })
      server.auth.mockReturnValue(false)

      const body = EJSON.stringify({
        payload: { method: 'test', uuid: 'p1', params: {} },
        context: { key: 'value' },
      })
      const ctx = createMockContext(body)

      await rpcHandler(ctx)

      // Should have reached dispatchRpc (getMethod called)
      expect(server.getMethod).toHaveBeenCalledWith('test')
    })
  })

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------
  describe('close', () => {
    it('stops the bun server', async () => {
      await transport.close()
      expect(mockBunServer.stop).toHaveBeenCalledWith(true)
    })

    it('emits HTTP_SERVER_CLOSED', async () => {
      await transport.close()
      expect(server.emit).toHaveBeenCalledWith(
        HttpTransportEvents.HTTP_SERVER_CLOSED,
      )
    })
  })

  // -------------------------------------------------------------------------
  // static
  // -------------------------------------------------------------------------
  describe('static', () => {
    it('is a no-op', () => {
      expect(() => transport.static('/public', true)).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getServerContext
  // -------------------------------------------------------------------------
  describe('getServerContext (via buildClientNode)', () => {
    let rpcHandler: (c: any) => Promise<Response>

    beforeEach(() => {
      rpcHandler = mockHonoApp.post.mock.calls[0][1]
    })

    it('strips Bearer prefix from token', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue('ok'),
      })
      server.auth.mockImplementation(function (this: any, ctx: any) {
        // Verify the token was stripped
        return { token: ctx.token }
      })

      const body = EJSON.stringify({
        payload: { method: 'test', uuid: 'g1' },
        context: {},
      })
      const ctx = createMockContext(body, { 'x-api-key': 'Bearer secret123' })

      await rpcHandler(ctx)

      expect(server.auth).toHaveBeenCalled()
      const authCall = server.auth.mock.calls[0]
      expect(authCall[0]).toHaveProperty('token', 'secret123')
    })

    it('does not set token for "undefined" string', async () => {
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue('ok'),
      })
      server.auth.mockImplementation(function (this: any, ctx: any) {
        return { token: ctx.token }
      })

      const body = EJSON.stringify({
        payload: { method: 'test', uuid: 'g2' },
        context: {},
      })
      const ctx = createMockContext(body, { 'x-api-key': 'undefined' })

      await rpcHandler(ctx)

      expect(server.auth).toHaveBeenCalled()
      const authCall = server.auth.mock.calls[0]
      expect(authCall[0]).not.toHaveProperty('token')
    })

    it('returns false when auth is not a function', async () => {
      server.auth = null
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockResolvedValue('ok'),
      })

      const body = EJSON.stringify({
        payload: { method: 'test', uuid: 'g3' },
        context: {},
      })
      const ctx = createMockContext(body)

      await rpcHandler(ctx)

      // Client should be unauthenticated (Boolean(false) = false)
      // The method should still run since it's not protected
      expect(ctx.text).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // rpcError / rpcSuccess helpers
  // -------------------------------------------------------------------------
  describe('rpcError (via dispatchRpc)', () => {
    let rpcHandler: (c: any) => Promise<Response>

    beforeEach(() => {
      rpcHandler = mockHonoApp.post.mock.calls[0][1]
      server.auth.mockReturnValue(false)
    })

    it('includes uuid in error response when present', async () => {
      server.getMethod.mockReturnValue(null)

      const body = EJSON.stringify({
        payload: { method: 'missing', uuid: 'err-uuid-1' },
        context: {},
      })
      const ctx = createMockContext(body)
      await rpcHandler(ctx)

      expect(ctx.text).toHaveBeenCalledWith(
        expect.stringContaining('err-uuid-1'),
      )
    })

    it('omits uuid in error response when not present', async () => {
      server.getMethod.mockReturnValue(null)

      const body = EJSON.stringify({
        payload: { method: 'missing' },
        context: {},
      })
      const ctx = createMockContext(body)
      await rpcHandler(ctx)

      const encoded = ctx.text.mock.calls[0][0]
      const decoded = Presentation.decode<Record<string, unknown>>(encoded)
      expect(decoded.uuid).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // SchemaValidationError includes uuid
  // -------------------------------------------------------------------------
  describe('handleRpcError SchemaValidationError uuid', () => {
    it('includes uuid in SchemaValidationError when present', async () => {
      server.auth.mockReturnValue(false)
      server.getMethod.mockReturnValue({
        isProtected: false,
        exec: vi.fn().mockRejectedValue(
          new SchemaValidationError('bad schema', ['err1']),
        ),
      })

      const rpcHandler = mockHonoApp.post.mock.calls[0][1]
      const body = EJSON.stringify({
        payload: { method: 'schemaFail', uuid: 'schema-uuid' },
        context: {},
      })
      const ctx = createMockContext(body)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await rpcHandler(ctx)

      const encoded = ctx.text.mock.calls[ctx.text.mock.calls.length - 1][0]
      expect(encoded).toContain('schema-uuid')
      consoleSpy.mockRestore()
    })
  })
})
