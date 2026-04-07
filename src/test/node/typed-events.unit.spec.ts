import { describe, expect, it } from 'vitest'

import { TestUtility } from '../test-utility'

/**
 * Tests for WebSocket wire protocol message types.
 *
 * - RPC results/errors use `{ t: "rpc:res", id }` correlated by UUID
 * - Subscription events use `{ t: "event" }` envelope
 * - Auth results use `{ t: "auth" }` envelope
 * - Keep-alive uses application-level `{ t: "ping" }` / `{ t: "pong" }`
 */
describe('Typed Events', () => {
  const test = new TestUtility()

  describe('bifrost:event', () => {
    it('should receive event via typed event', async () => {
      test.server.addEvent('typed:test-event')
      await test.client.subscribe('typed:test-event')

      const eventPromise = new Promise<any>(resolve => {
        test.client.once('typed:test-event', resolve)
      })

      const clientNode = test.server.allClients.get(test.client.uuid)
      expect(clientNode).toBeDefined()

      clientNode!.emitBifrostEvent('typed:test-event', undefined, {
        message: 'hello',
      })

      const result = await eventPromise

      expect(result).toBeDefined()
      expect(result.message).toBe('hello')
    })

    it('should receive channel event via typed event', async () => {
      const channelName = 'test-channel'

      test.server.addEvent('typed:channel-event')
      await test.client.channel(channelName)?.subscribe('typed:channel-event')

      const eventPromise = new Promise<any>(resolve => {
        test.client.channel(channelName)?.once('typed:channel-event', resolve)
      })

      const clientNode = test.server.allClients.get(test.client.uuid)
      expect(clientNode).toBeDefined()

      clientNode!.emitBifrostEvent('typed:channel-event', channelName, {
        data: 123,
      })

      const result = await eventPromise

      expect(result).toBeDefined()
      expect(result.data).toBe(123)
    })
  })

  describe('bifrost:auth', () => {
    it('should receive auth result via typed event', async () => {
      const server = await test.createRandomSrv({ globalInstance: false })

      server.setAuth({
        auth(context) {
          return context?.token === 'valid'
            ? { ...context, user: { _id: 'user123' } }
            : false
        },
        async logIn() {
          return { token: 'valid' }
        },
      })

      const client = await test.createClient({
        port: server.port,
        context: { token: 'valid' },
      })

      expect(client.authenticated).toBe(true)
    })

    it('should handle unauthenticated via typed event', async () => {
      const server = await test.createRandomSrv({ globalInstance: false })

      server.setAuth({
        auth(context) {
          return context?.token === 'valid'
            ? { ...context, user: { _id: 'user123' } }
            : false
        },
        async logIn() {
          return { token: 'valid' }
        },
      })

      const client = await test.createClient({
        port: server.port,
        context: { token: 'invalid' },
      })

      expect(client.authenticated).toBe(false)
    })
  })

  describe('RPC via UUID correlation', () => {
    it('should call methods via UUID-correlated RPC', async () => {
      test.server.addMethod('ack:add', ({ a, b }) => a + b)

      const result = await test.client.call('ack:add', { a: 2, b: 3 })

      expect(result).toBe(5)
    })

    it('should receive errors via UUID-correlated RPC', async () => {
      test.server.addMethod('ack:error', () => {
        throw new Error('Test error')
      })

      await expect(test.client.call('ack:error')).rejects.toThrow(
        'Internal Error',
      )
    })
  })
})
