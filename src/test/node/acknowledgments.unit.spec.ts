import { describe, expect, it } from 'vitest'

import { Errors, PublicError, sleep } from '../../utils'
import { TestUtility } from '../test-utility'

/**
 * Tests for UUID-correlated RPC calls over native WebSocket.
 *
 * Validates `client.call()` which sends `{ t: "rpc", id, method, params }`
 * and resolves when the server responds with `{ t: "rpc:res", id, result }`.
 */
describe('Acknowledgments', () => {
  const test = new TestUtility()

  describe('call', () => {
    it('should call a method and get a response', async () => {
      test.server.addMethod('ack:add', function ({ a, b }) {
        return a + b
      })

      const result = await test.client.call('ack:add', { a: 5, b: 3 })

      expect(result).toEqual(8)
    })

    it('should handle async methods', async () => {
      test.server.addMethod('ack:async', async ({ value }) => {
        await sleep(50)
        return value * 2
      })

      const result = await test.client.call('ack:async', { value: 21 })

      expect(result).toEqual(42)
    })

    it('should reject with error for non-existent method', async () => {
      await expect(test.client.call('ack:nonexistent', {})).rejects.toThrow(
        Errors.METHOD_NOT_FOUND,
      )
    })

    it('should reject with internal error for thrown errors', async () => {
      test.server.addMethod('ack:throws', () => {
        throw new Error('Internal failure')
      })

      await expect(test.client.call('ack:throws', {})).rejects.toThrow(
        Errors.INTERNAL_ERROR,
      )
    })

    it('should propagate public errors', async () => {
      test.server.addMethod('ack:public-error', () => {
        throw new PublicError('This is a public error')
      })

      await expect(test.client.call('ack:public-error', {})).rejects.toThrow(
        'This is a public error',
      )
    })

    it('should timeout when server takes too long', async () => {
      test.server.addMethod('ack:slow', async () => {
        await sleep(5000)
        return 'done'
      })

      await expect(
        test.client.call('ack:slow', {}, { timeout: 100 }),
      ).rejects.toThrow('Acknowledgment timeout')
    })

    it('should handle undefined return value', async () => {
      test.server.addMethod('ack:undefined', () => undefined)

      const result = await test.client.call('ack:undefined', {})

      expect(result).toBeUndefined()
    })

    it('should handle null return value', async () => {
      test.server.addMethod('ack:null', () => null)

      const result = await test.client.call('ack:null', {})

      expect(result).toBeNull()
    })

    it('should handle complex return types', async () => {
      test.server.addMethod('ack:complex', () => ({
        string: 'hello',
        number: 42,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
        date: new Date('2024-01-01'),
      }))

      const result = await test.client.call('ack:complex', {})

      expect(result).toMatchObject({
        string: 'hello',
        number: 42,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
      })
      expect(result.date).toBeInstanceOf(Date)
    })

    it('should handle protected methods when authenticated', async () => {
      const server = await test.createRandomSrv({ globalInstance: false })

      server.setAuth({
        auth(context) {
          return context?.token === 'test'
            ? { ...context, user: { _id: 'user123' } }
            : false
        },
        async logIn() {
          return { token: 'test' }
        },
      })

      server.addMethod(
        'ack:protected',
        function () {
          return `Hello, ${this.userId}`
        },
        { protected: true },
      )

      const client = await test.createAuthenticatedClient({ port: server.port })

      const result = await client.call('ack:protected', {})

      expect(result).toEqual('Hello, user123')
    })

    it('should reject protected methods when not authenticated', async () => {
      test.server.addMethod('ack:protected-forbidden', () => 'secret', {
        protected: true,
      })

      await expect(
        test.client.call('ack:protected-forbidden', {}),
      ).rejects.toThrow(Errors.METHOD_FORBIDDEN)
    })

    it('should respect rate limits', async () => {
      const server = await test.createRandomSrv({ globalInstance: false })
      const client = await test.createClient({ port: server.port })

      server.addMethod('ack:rate-limited', v => v)

      const calls = Array.from({ length: 200 }, (_, i) =>
        client.call('ack:rate-limited', { i }),
      )

      await expect(Promise.all(calls)).rejects.toThrow(
        Errors.RATE_LIMIT_EXCEEDED,
      )
    })

    it('should fall back to HTTP when socket not ready', async () => {
      test.server.addMethod('ack:fallback', () => 'http-response')

      await test.client.clientSocket.close()

      const result = await test.client.call(
        'ack:fallback',
        {},
        { ignoreInit: true },
      )

      expect(result).toEqual('http-response')
    })
  })

  describe('settlement guard', () => {
    /**
     * Verifies that a late-arriving response after a timeout does not
     * cause double-settlement. The pending request map entry is cleaned
     * up on timeout, so the late response is safely ignored.
     */
    it('should not resolve after timeout has already rejected', async () => {
      test.server.addMethod('ack:late-response', async () => {
        await sleep(300)
        return 'late'
      })

      const promise = test.client.call('ack:late-response', {}, { timeout: 50 })

      await expect(promise).rejects.toThrow('Acknowledgment timeout')

      // Wait for the late response to arrive — should not throw
      await sleep(400)
    })
  })
})
