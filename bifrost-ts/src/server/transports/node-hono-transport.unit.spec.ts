import WebSocket from 'ws'
import { describe, expect, it, vi } from 'vitest'

import { EJSON } from '../../ejson'
import type { BifrostResponse } from '../request-types'
import { Server } from '../server'
import { PublicError, ServerEvents } from '../../utils'

const LOCAL_HOST = '127.0.0.1'

/** Creates a real Node listener and resolves only after its port is assigned. */
async function createServer(options: {
  maxRequestBodySize?: number
  origins?: string[]
} = {}): Promise<Server> {
  const server = new Server({
    ...options,
    globalInstance: false,
    host: LOCAL_HOST,
    port: 0,
  })
  await server.isReady()
  return server
}

/** Encodes a raw Bifrost HTTP request for transport-level assertions. */
function rpcBody(method: string, uuid: string = 'transport-test'): string {
  return EJSON.stringify({
    context: {},
    payload: { method, params: null, uuid },
  })
}

describe('NodeHonoTransport', () => {
  it('serves Hono HTTP and WebSocket upgrades on the same listener', async () => {
    const server = await createServer()
    server.app.get('/health', c => c.text('ok'))

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/health`)
    expect(await response.text()).toBe('ok')
    expect(server.httpTransport.http?.listenerCount('upgrade')).toBe(1)

    const socket = new WebSocket(
      `ws://${LOCAL_HOST}:${server.port}/bifrost-ws?uuid=transport-socket`
    )
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })
    expect(server.allClients.has('transport-socket')).toBe(true)

    socket.close()
    await server.close()
  })

  it('gates HTTP and WebSocket traffic when connections are disabled', async () => {
    const server = await createServer()
    server.acceptConnections = false

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/__h`, {
      body: rpcBody('unknown'),
      method: 'POST',
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('1')

    const socket = new WebSocket(
      `ws://${LOCAL_HOST}:${server.port}/bifrost-ws?uuid=rejected-socket`
    )
    await new Promise<void>(resolve => {
      socket.once('error', () => resolve())
      socket.once('close', () => resolve())
    })
    expect(server.allClients.has('rejected-socket')).toBe(false)

    await server.close()
  })

  it('preserves CORS allow-list behavior', async () => {
    const allowedOrigin = 'https://allowed.example'
    const server = await createServer({ origins: [allowedOrigin] })
    server.app.get('/cors', c => c.text('ok'))

    const allowed = await fetch(`http://${LOCAL_HOST}:${server.port}/cors`, {
      headers: { origin: allowedOrigin },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      allowedOrigin
    )
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')

    const denied = await fetch(`http://${LOCAL_HOST}:${server.port}/cors`, {
      headers: { origin: 'https://denied.example' },
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()

    await server.close()
  })

  it('preserves forwarded remote IP and multiple response cookies', async () => {
    const server = await createServer()
    server.addMethod('transport:metadata', function () {
      const response = this.res as BifrostResponse
      response.setHeader('Set-Cookie', 'first=one; Path=/')
      response.setHeader('Set-Cookie', 'second=two; Path=/')
      return this.remoteAddress
    })

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/__h`, {
      body: rpcBody('transport:metadata'),
      headers: { 'x-forwarded-for': '203.0.113.9' },
      method: 'POST',
    })
    const payload = EJSON.parse(await response.text()) as {
      result: string
    }
    expect(payload.result).toBe('203.0.113.9')
    expect(response.headers.getSetCookie()).toEqual([
      'first=one; Path=/',
      'second=two; Path=/',
    ])

    await server.close()
  })

  it('tracks the direct peer address when no forwarding header is present', async () => {
    const server = await createServer()
    server.addMethod('transport:direct-address', function () {
      return this.remoteAddress
    })

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/__h`, {
      body: rpcBody('transport:direct-address'),
      method: 'POST',
    })
    const payload = EJSON.parse(await response.text()) as {
      result: string
    }
    expect(payload.result).toMatch(/127\.0\.0\.1|::ffff:127\.0\.0\.1/)

    await server.close()
  })

  it('preserves cookies set by route authentication middleware', async () => {
    const server = await createServer()
    server.setAuth({
      auth: function () {
        const response = this.res as BifrostResponse
        response.setHeader('Set-Cookie', 'authenticated=true; Path=/')
        return { user: { _id: 'middleware-user' } }
      },
      logIn: async function () {
        return true
      },
    })
    server.app.get(
      '/authenticated',
      server.httpTransport.authMiddleware,
      c => c.text('ok')
    )

    const response = await fetch(
      `http://${LOCAL_HOST}:${server.port}/authenticated`
    )
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([
      'authenticated=true; Path=/',
    ])

    await server.close()
  })

  it('preserves response cookies when an RPC returns a public error', async () => {
    const server = await createServer()
    server.addMethod('transport:public-error', function () {
      const response = this.res as BifrostResponse
      response.setHeader('Set-Cookie', 'retry=allowed; Path=/')
      throw new PublicError('Try Again')
    })

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/__h`, {
      body: rpcBody('transport:public-error'),
      method: 'POST',
    })
    expect(response.headers.getSetCookie()).toEqual(['retry=allowed; Path=/'])
    expect(await response.text()).toContain('Try Again')

    await server.close()
  })

  it('enforces the configured request-body limit', async () => {
    const server = await createServer({ maxRequestBodySize: 32 })

    const response = await fetch(`http://${LOCAL_HOST}:${server.port}/__h`, {
      body: rpcBody('unknown').repeat(4),
      method: 'POST',
    })
    expect(response.status).toBe(413)

    await server.close()
  })

  it('closes idempotently and emits one closed lifecycle event', async () => {
    const server = await createServer()
    let closeEvents = 0
    server.on(ServerEvents.CLOSED, () => {
      closeEvents += 1
    })

    await Promise.all([server.close(), server.close()])

    expect(closeEvents).toBe(1)
  })

  it('disposes rate-limit cleanup when the listener closes', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    try {
      const server = new Server({
        globalInstance: false,
        host: LOCAL_HOST,
        port: 0,
        rateLimit: true,
      })
      await server.isReady()

      await server.close()

      expect(clearIntervalSpy).toHaveBeenCalled()
    } finally {
      clearIntervalSpy.mockRestore()
    }
  })
})
