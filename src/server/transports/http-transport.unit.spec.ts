import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock express - vi.hoisted ensures the variables are available to the hoisted vi.mock calls
const {
  mockUse,
  mockPost,
  mockExpressStatic,
  mockExpressApp,
  mockHttpOn,
  mockHttpListen,
  mockHttpClose,
  mockHttpCloseAllConnections,
  mockHttpUnref,
} = vi.hoisted(() => {
  const mockUse = vi.fn()
  const mockPost = vi.fn()
  const mockExpressStatic = vi.fn().mockReturnValue('static-middleware')
  const mockExpressApp = {
    use: mockUse,
    post: mockPost,
  }
  const mockHttpOn = vi.fn()
  const mockHttpListen = vi.fn()
  const mockHttpClose = vi.fn((cb: any) => cb?.())
  const mockHttpCloseAllConnections = vi.fn()
  const mockHttpUnref = vi.fn()
  return {
    mockUse,
    mockPost,
    mockExpressStatic,
    mockExpressApp,
    mockHttpOn,
    mockHttpListen,
    mockHttpClose,
    mockHttpCloseAllConnections,
    mockHttpUnref,
  }
})

vi.mock('express', () => {
  const expressFn: any = vi.fn(() => mockExpressApp)
  expressFn.urlencoded = vi.fn().mockReturnValue('urlencoded-middleware')
  expressFn.text = vi.fn().mockReturnValue('text-middleware')
  expressFn.static = mockExpressStatic
  return { default: expressFn }
})

let lastCorsOpts: any = null
vi.mock('cors', () => ({
  default: vi.fn((opts: any) => {
    lastCorsOpts = opts
    return 'cors-middleware'
  }),
}))

vi.mock('express-rate-limit', () => ({
  default: vi.fn().mockReturnValue('rate-limit-middleware'),
}))

vi.mock('http', () => ({
  default: {
    createServer: vi.fn().mockReturnValue({
      on: mockHttpOn,
      listen: mockHttpListen,
      close: mockHttpClose,
      closeAllConnections: mockHttpCloseAllConnections,
      unref: mockHttpUnref,
    }),
  },
}))

vi.mock('../client-node', () => {
  return {
    ClientNode: class MockClientNode {
      uuid = 'mock-uuid'
      authenticated = false
      setTrackingProperties = vi.fn()
      setContext = vi.fn()
      req = { headers: {} }
      userId = null
      context = {}
      remoteAddress = ''
      userAgent = ''
      constructor(..._args: any[]) {}
    },
  }
})

import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { HttpTransport, HttpTransportEvents } from './http-transport'
import {
  Errors,
  Presentation,
  PayloadType,
  PublicError,
  SchemaValidationError,
  ServerEvents,
} from '../../utils'
import { EJSON } from '../../ejson'

function createMockServer(overrides: Record<string, any> = {}) {
  return {
    emit: vi.fn(),
    auth: null,
    requestListener: null,
    getMethod: vi.fn(),
    rateLimit: false,
    isAuthEnabled: false,
    ...overrides,
  } as any
}

describe('HttpTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastCorsOpts = null
  })

  describe('constructor', () => {
    it('creates express app and http server', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      expect(transport.express).toBe(mockExpressApp)
      expect(transport.http).toBeDefined()
    })

    it('sets up rate limiting when limit is provided as boolean', () => {
      const server = createMockServer()
      new HttpTransport(server, [], true as any)

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 60000,
          max: 120,
          standardHeaders: true,
          legacyHeaders: false,
        }),
      )
    })

    it('sets up rate limiting when limit is provided as object', () => {
      const server = createMockServer()
      new HttpTransport(server, [], { max: 50, interval: 30000 } as any)

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 30000,
          max: 50,
        }),
      )
    })

    it('sets up CORS when origins are provided', () => {
      const server = createMockServer()
      new HttpTransport(server, ['http://example.com'], false)

      expect(cors).toHaveBeenCalled()
    })

    it('registers request listener when provided', () => {
      const listener = vi.fn()
      const server = createMockServer({ requestListener: listener })
      new HttpTransport(server, [], false)

      expect(mockHttpOn).toHaveBeenCalledWith('request', listener)
    })
  })

  describe('setCORS', () => {
    it('accepts allowed origins', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      transport.setCORS(['http://allowed.com'])

      const cb = vi.fn()
      lastCorsOpts.origin('http://allowed.com', cb)

      expect(cb).toHaveBeenCalledWith(null, true)
    })

    it('rejects disallowed origins', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      transport.setCORS(['http://allowed.com'])

      const cb = vi.fn()
      lastCorsOpts.origin('http://evil.com', cb)

      expect(cb).toHaveBeenCalledWith(expect.any(Error))
    })

    it('allows requests with no origin (same-origin or server-to-server)', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      transport.setCORS(['http://allowed.com'])

      const cb = vi.fn()
      lastCorsOpts.origin(undefined, cb)

      expect(cb).toHaveBeenCalledWith(null, true)
    })
  })

  describe('authMiddleware', () => {
    it('returns 403 when auth function returns false', async () => {
      const server = createMockServer({
        auth: vi.fn().mockReturnValue(false),
      })
      const transport = new HttpTransport(server, [], false)

      const req = { headers: {} } as any
      const res = {
        status: vi.fn().mockReturnThis(),
        end: vi.fn(),
      } as any
      const next = vi.fn()

      await transport.authMiddleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.end).toHaveBeenCalledWith('403 Forbidden')
      expect(next).not.toHaveBeenCalled()
    })

    it('calls next with context when auth succeeds', async () => {
      const authResult = { user: { _id: '123' } }
      const server = createMockServer({
        auth: vi.fn().mockReturnValue(authResult),
      })
      const transport = new HttpTransport(server, [], false)

      const req = { headers: {} } as any
      const res = {
        status: vi.fn().mockReturnThis(),
        end: vi.fn(),
      } as any
      const next = vi.fn()

      await transport.authMiddleware(req, res, next)

      expect(req.context).toEqual(authResult)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('contextMiddleware', () => {
    it('sets req.context from server auth', async () => {
      const contextResult = { user: { _id: '456', email: 'test@test.com' } }
      const server = createMockServer({
        auth: vi.fn().mockReturnValue(contextResult),
      })
      const transport = new HttpTransport(server, [], false)

      const req = { headers: {} } as any
      const res = {} as any
      const next = vi.fn()

      await transport.contextMiddleware(req, res, next)

      expect(req.context).toEqual(contextResult)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('static', () => {
    it('registers static middleware', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      mockUse.mockClear()
      transport.static('/public', false)

      expect(mockExpressStatic).toHaveBeenCalledWith('/public')
      expect(mockUse).toHaveBeenCalledWith('/', 'static-middleware')
    })

    it('registers catch-all middleware when catchAll is true', () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      mockUse.mockClear()
      transport.static('/public', true)

      expect(mockExpressStatic).toHaveBeenCalledWith('/public')
      // Should be called twice: once for '/' and once for catch-all
      const calls = mockUse.mock.calls.filter(
        ([path]: [any]) => path === '/' || path instanceof RegExp,
      )
      expect(calls.length).toBe(2)
    })
  })

  describe('close', () => {
    it('resolves and emits HTTP_SERVER_CLOSED when http is null', async () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      ;(transport as any).http = undefined

      await transport.close()

      expect(server.emit).toHaveBeenCalledWith(
        HttpTransportEvents.HTTP_SERVER_CLOSED,
      )
    })

    it('closes all connections and unrefs the server', async () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      await transport.close()

      expect(mockHttpCloseAllConnections).toHaveBeenCalled()
      expect(mockHttpClose).toHaveBeenCalled()
      expect(mockHttpUnref).toHaveBeenCalled()
      expect(server.emit).toHaveBeenCalledWith(
        HttpTransportEvents.HTTP_SERVER_CLOSED,
      )
    })

    it('sets http to undefined after closing to prevent double close', async () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      await transport.close()
      expect(transport.http).toBeUndefined()
    })
  })

  describe('getServerContext', () => {
    it('returns false when no auth function is set', async () => {
      const server = createMockServer({ auth: null })
      const transport = new HttpTransport(server, [], false)

      const clientNode = { req: { headers: {} } } as any
      const result = await transport.getServerContext(clientNode)
      expect(result).toBe(false)
    })

    it('extracts token from headers and passes to auth', async () => {
      const authFn = vi.fn().mockReturnValue({ user: { _id: '1' } })
      const server = createMockServer({ auth: authFn })
      const transport = new HttpTransport(server, [], false)

      const clientNode = {
        req: { headers: { 'x-api-key': 'Bearer my-token' } },
      } as any

      await transport.getServerContext(clientNode, {})

      expect(authFn).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'my-token' }),
      )
    })

    it('handles async auth functions', async () => {
      const authFn = vi.fn().mockResolvedValue({ user: { _id: '1' } })
      const server = createMockServer({ auth: authFn })
      const transport = new HttpTransport(server, [], false)

      const clientNode = { req: { headers: {} } } as any
      const result = await transport.getServerContext(clientNode)
      expect(result).toEqual({ user: { _id: '1' } })
    })

    it('ignores token header with value "undefined"', async () => {
      const authFn = vi.fn().mockReturnValue({ user: { _id: '1' } })
      const server = createMockServer({ auth: authFn })
      const transport = new HttpTransport(server, [], false)

      const clientNode = {
        req: { headers: { 'x-api-key': 'undefined' } },
      } as any

      await transport.getServerContext(clientNode, {})

      // Token should not be in the context
      expect(authFn).toHaveBeenCalledWith(
        expect.not.objectContaining({ token: 'undefined' }),
      )
    })
  })

  describe('requestHandler', () => {
    it('returns error for requests without payload', async () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      const req = { body: JSON.stringify({ context: {} }) } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe(Errors.INVALID_REQUEST)
    })

    it('returns METHOD_NOT_FOUND for unknown methods', async () => {
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(undefined),
      })
      const transport = new HttpTransport(server, [], false)

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: { method: 'unknown', params: {} },
        }),
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe(Errors.METHOD_NOT_FOUND)
    })

    it('returns METHOD_FORBIDDEN when method is protected and client is not authenticated', async () => {
      const method = { isProtected: true, exec: vi.fn() }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: { method: 'protected.method', params: {} },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe(Errors.METHOD_FORBIDDEN)
    })

    it('handles PublicError in catch block', async () => {
      const method = {
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new PublicError('public error msg')),
      }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: { method: 'failing.method', params: {} },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe('public error msg')

      spy.mockRestore()
    })

    it('handles SchemaValidationError in catch block', async () => {
      const method = {
        isProtected: false,
        exec: vi
          .fn()
          .mockRejectedValue(
            new SchemaValidationError('validation failed', [
              'field is required',
            ]),
          ),
      }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: {
            method: 'validate.method',
            params: {},
            uuid: 'req-uuid',
          },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe('validation failed')
      expect(decoded.errors).toEqual(['field is required'])

      spy.mockRestore()
    })

    it('returns INTERNAL_ERROR for generic errors', async () => {
      const method = {
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new Error('unexpected')),
      }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: {
            method: 'err.method',
            params: {},
            uuid: 'req-uuid',
          },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe(Errors.INTERNAL_ERROR)

      spy.mockRestore()
    })

    it('does not send response for void calls that error', async () => {
      const method = {
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new Error('void error')),
      }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: {
            method: 'void.method',
            params: {},
            void: true,
          },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      // res.send should NOT be called for void methods that error
      expect(res.send).not.toHaveBeenCalled()

      spy.mockRestore()
    })

    it('emits METHOD_ERROR event on error', async () => {
      const method = {
        isProtected: false,
        exec: vi.fn().mockRejectedValue(new Error('some error')),
      }
      const server = createMockServer({
        getMethod: vi.fn().mockReturnValue(method),
      })
      const transport = new HttpTransport(server, [], false)

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const req = {
        body: EJSON.stringify({
          context: {},
          payload: {
            method: 'err.method',
            params: { foo: 1 },
          },
        }),
        headers: {},
      } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      expect(server.emit).toHaveBeenCalledWith(
        ServerEvents.METHOD_ERROR,
        expect.objectContaining({
          method: 'err.method',
          params: { foo: 1 },
        }),
      )

      spy.mockRestore()
    })

    it('handles non-string body gracefully', async () => {
      const server = createMockServer()
      const transport = new HttpTransport(server, [], false)

      const req = { body: null } as any
      const res = { send: vi.fn() } as any

      await transport.requestHandler(req, res)

      const decoded = Presentation.decode<any>(res.send.mock.calls[0][0])
      expect(decoded.message).toBe(Errors.INVALID_REQUEST)
    })
  })
})
