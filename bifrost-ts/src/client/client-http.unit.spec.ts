import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client } from './client'
import { ClientHttp, ClientHttpResponseError } from './client-http'

// Mock global fetch
global.fetch = vi.fn() as unknown as typeof fetch

describe('ClientHttp', () => {
  let client: Partial<Client>
  let clientHttp: ClientHttp

  beforeEach(() => {
    client = {
      options: { host: 'localhost', secure: false },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    clientHttp = new ClientHttp(client as unknown as Client)
    vi.clearAllMocks()
  })

  it('should include credentials: "include" in fetch options', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response)

    await clientHttp.request(
      { foo: 'bar' },
      () => undefined,
      () => undefined,
    )

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/__h'),
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})

describe('ClientHttp error handling', () => {
  let client: Partial<Client>
  let clientHttp: ClientHttp

  beforeEach(() => {
    client = {
      options: { host: 'localhost', secure: false },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    clientHttp = new ClientHttp(client as unknown as Client)
    vi.clearAllMocks()
  })

  it('rejects with error when HTTP status is not 200', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Something went wrong'),
    } as Response)

    const resolve = vi.fn()
    const reject = vi.fn()

    await clientHttp.request({ method: 'test' }, resolve, reject)

    expect(reject).toHaveBeenCalledWith(expect.any(Error))
    expect(resolve).not.toHaveBeenCalled()

    const error = reject.mock.calls[0][0] as Error
    expect(error).toBeInstanceOf(ClientHttpResponseError)
    expect(error).toMatchObject({ status: 500 })
    expect(error.message).toContain('500')
    expect(error.message).toContain('Internal Server Error')
  })

  it('logs the error details when HTTP status is not 200', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve('Access denied'),
    } as Response)

    const reject = vi.fn()

    await clientHttp.request({ method: 'some.method' }, vi.fn(), reject)

    expect(client.logger!.method).toHaveBeenCalledWith(
      expect.anything(), // LogLevel.ERROR
      'HTTP request failed',
      expect.objectContaining({
        status: 403,
        statusText: 'Forbidden',
        method: 'some.method',
      }),
      expect.any(Error),
    )
  })

  it('rejects and logs on fetch network error (catch block)', async () => {
    const networkError = new Error('Failed to fetch')
    vi.mocked(global.fetch).mockRejectedValue(networkError)

    const resolve = vi.fn()
    const reject = vi.fn()

    await clientHttp.request({ method: 'test.method' }, resolve, reject)

    expect(reject).toHaveBeenCalledWith(networkError)
    expect(resolve).not.toHaveBeenCalled()
    expect(client.logger!.method).toHaveBeenCalledWith(
      expect.anything(), // LogLevel.ERROR
      'HTTP request error',
      expect.objectContaining({
        method: 'test.method',
      }),
      networkError,
    )
  })

  it('returns early without calling resolve when resolve is null (fire-and-forget)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{"type":"result","result":"ok"}'),
    } as Response)

    const reject = vi.fn()

    // Pass null as resolve to simulate fire-and-forget
    await clientHttp.request({ method: 'void.method' }, null, reject)

    expect(reject).not.toHaveBeenCalled()
    // No crash — graceful early return
  })

  it('includes token header when context has a token', async () => {
    client.context = { token: 'my-secret-token' }

    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response)

    await clientHttp.request(
      { method: 'test' },
      () => undefined,
      () => undefined,
    )

    expect(global.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'my-secret-token',
        }),
      }),
    )
  })

  it('does not include token header when context has no token', async () => {
    client.context = {}

    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response)

    await clientHttp.request(
      { method: 'test' },
      () => undefined,
      () => undefined,
    )

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const headers = (fetchCall[1] as any).headers
    expect(headers['x-api-key']).toBeUndefined()
  })

  it('rejects when decoded response is a PayloadType.ERROR', async () => {
    // Encode a valid EJSON error payload
    const { EJSON } = await import('../ejson')
    const errorPayload = EJSON.stringify({ type: 'error', message: 'Something failed' })

    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(errorPayload),
    } as Response)

    const resolve = vi.fn()
    const reject = vi.fn()

    await clientHttp.request({ method: 'test' }, resolve, reject)

    expect(reject).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
    expect(resolve).not.toHaveBeenCalled()
  })

  it('calls resolve with decoded result on success', async () => {
    const { EJSON } = await import('../ejson')
    const successPayload = EJSON.stringify({ type: 'result', result: { data: 42 } })

    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(successPayload),
    } as Response)

    const resolve = vi.fn()
    const reject = vi.fn()

    await clientHttp.request({ method: 'test' }, resolve, reject)

    expect(resolve).toHaveBeenCalledWith({ data: 42 })
    expect(reject).not.toHaveBeenCalled()
  })

  it('strips refreshToken from context before sending', async () => {
    client.context = { token: 'access-tok', refreshToken: 'secret-refresh' }

    const { EJSON } = await import('../ejson')
    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(EJSON.stringify({ type: 'result', result: 'ok' })),
    } as Response)

    await clientHttp.request(
      { method: 'test' },
      () => undefined,
      () => undefined,
    )

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const body = (fetchCall[1] as any).body
    const parsed = EJSON.parse(body)

    expect(parsed.context).not.toHaveProperty('refreshToken')
    expect(parsed.context).toHaveProperty('token', 'access-tok')
  })
})

describe('ClientHttp constructor variations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses https protocol when secure is true', () => {
    const client: Partial<Client> = {
      options: { host: 'example.com', secure: true, port: 443 },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    const http = new ClientHttp(client as unknown as Client)
    expect(http.host).toContain('https://')
  })

  it('uses port in host URL when specified', () => {
    const client: Partial<Client> = {
      options: { host: 'localhost', secure: false, port: 3000 },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    const http = new ClientHttp(client as unknown as Client)
    expect(http.host).toBe('http://localhost:3000')
  })

  it('omits port from host URL when no port specified', () => {
    const client: Partial<Client> = {
      options: { host: 'example.com', secure: false },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    const http = new ClientHttp(client as unknown as Client)
    expect(http.host).toBe('http://example.com')
  })

  it('uses httpPort when explicitly set', () => {
    const client: Partial<Client> = {
      options: { host: 'localhost', secure: false, httpPort: 4000, port: 3000 },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    const http = new ClientHttp(client as unknown as Client)
    expect(http.host).toBe('http://localhost:4000')
  })

  it('falls back to page origin when httpPort key is present but undefined', () => {
    const client: Partial<Client> = {
      options: { host: 'localhost', secure: false, httpPort: undefined, port: 3000 },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    const http = new ClientHttp(client as unknown as Client)
    // No window in Node, so falls back to protocol+host
    expect(http.host).toBe('http://localhost')
  })
})
