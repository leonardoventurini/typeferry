import { describe, expect, it, vi } from 'vitest'

import type { Client } from './client'
import { ClientHttp } from './client-http'
import { ClientSocket } from './client-socket'
import { resolveBackendOrigins } from './backend-origin'

const backend = { httpOrigin: 'https://api.example.test:8443/' }

function mockClient(): Client {
  return {
    options: { host: 'localhost', port: 8002, httpPort: undefined, backend },
    context: {},
    uuid: 'origin-test',
    emit: vi.fn(),
    logger: { method: vi.fn() },
  } as unknown as Client
}

describe('explicit backend origins', () => {
  it('infers WebSocket origin and normalizes a trailing slash', () => {
    expect(resolveBackendOrigins(backend)).toEqual({
      httpOrigin: 'https://api.example.test:8443',
      webSocketOrigin: 'wss://api.example.test:8443',
    })
  })

  it('accepts a separately deployed WebSocket origin', () => {
    expect(resolveBackendOrigins({
      httpOrigin: 'http://localhost:8000',
      webSocketOrigin: 'ws://localhost:8002',
    })).toEqual({ httpOrigin: 'http://localhost:8000', webSocketOrigin: 'ws://localhost:8002' })
  })

  it.each(['capacitor://localhost', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?key=secret', 'https://example.test/#fragment', '/relative'])('rejects an unsafe or non-origin HTTP URL: %s', httpOrigin => {
    expect(() => resolveBackendOrigins({ httpOrigin })).toThrow('HTTP backend must be an HTTP(S) origin')
  })

  it.each(['https://example.test', 'wss://example.test/socket', 'wss://user:secret@example.test'])('rejects a non-origin WebSocket URL: %s', webSocketOrigin => {
    expect(() => resolveBackendOrigins({ ...backend, webSocketOrigin })).toThrow('WebSocket backend must be a WS(S) origin')
  })

  it('uses explicit HTTP and WS origins ahead of legacy host/port options', () => {
    const client = mockClient()

    expect(new ClientHttp(client).uri).toBe('https://api.example.test:8443/__h')
    expect(new ClientSocket(client).uri).toBe('wss://api.example.test:8443')
  })

  it('uses an injected HTTP transport for cookie-bearing RPC', async () => {
    const client = mockClient()
    const httpFetch = vi.fn().mockResolvedValue(new Response('{"type":"result","result":true}'))
    client.options.httpFetch = httpFetch
    const resolve = vi.fn()
    const reject = vi.fn()

    await new ClientHttp(client).request({ method: 'auth.refresh' }, resolve, reject)

    expect(httpFetch).toHaveBeenCalledWith('https://api.example.test:8443/__h', expect.objectContaining({ method: 'POST', credentials: 'include' }))
    expect(resolve).toHaveBeenCalledWith(true)
    expect(reject).not.toHaveBeenCalled()
  })
})
