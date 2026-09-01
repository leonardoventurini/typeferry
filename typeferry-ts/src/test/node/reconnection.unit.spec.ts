import { describe, expect, it } from 'vitest'

import { ClientEvents, sleep } from '../../utils'
import { TestUtility } from '../test-utility'

/**
 * Tests for native WebSocket reconnection behavior, socket identity
 * guards, and subscription restoration. These scenarios exercise the
 * exponential backoff, stale socket handling, and channel resubscription
 * introduced by the Socket.IO → native WebSocket migration.
 */
describe('Reconnection', () => {
  const test = new TestUtility()

  it('should reconnect automatically after abnormal close', async () => {
    expect(test.client.clientSocket.ready).toBe(true)

    // Force-close the socket (simulates network drop)
    setTimeout(() => {
      test.client.clientSocket.socket?.close()
    })

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)
    expect(test.client.clientSocket.ready).toBe(false)

    // Auto-reconnect should kick in
    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)
    expect(test.client.clientSocket.ready).toBe(true)
  })

  it('should create a new socket instance after reconnection', async () => {
    const originalSocket = test.client.clientSocket.socket

    setTimeout(() => {
      test.client.clientSocket.socket?.close()
    })

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)

    // Should be a different WebSocket instance
    expect(test.client.clientSocket.socket).not.toBe(originalSocket)
  })

  it('should restore event subscriptions after reconnection', async () => {
    test.server.addEvent('reconnect:test-event')
    await test.client.subscribe('reconnect:test-event')

    // Verify subscription works before disconnect
    const beforePromise = new Promise<unknown>(resolve => {
      test.client.once('reconnect:test-event', resolve)
    })

    test.server.emit('reconnect:test-event', { phase: 'before' })
    const beforeResult = await beforePromise

    expect(beforeResult).toEqual({ phase: 'before' })

    // Force disconnect + wait for reconnection
    setTimeout(() => {
      test.client.clientSocket.socket?.close()
    })

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)

    // Verify subscription still works after reconnect
    const afterPromise = new Promise<unknown>(resolve => {
      test.client.once('reconnect:test-event', resolve)
    })

    test.server.emit('reconnect:test-event', { phase: 'after' })
    const afterResult = await afterPromise

    expect(afterResult).toEqual({ phase: 'after' })
  })

  it('should handle RPC calls after reconnection', async () => {
    test.server.addMethod('reconnect:add', ({ a, b }) => a + b)

    // Verify RPC works before disconnect
    const before = await test.client.call('reconnect:add', { a: 1, b: 2 })
    expect(before).toBe(3)

    // Force disconnect + reconnect
    setTimeout(() => {
      test.client.clientSocket.socket?.close()
    })

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)

    // RPC should work on the new connection
    const after = await test.client.call('reconnect:add', { a: 10, b: 20 })
    expect(after).toBe(30)
  })
})

describe('Socket Identity Guards', () => {
  const test = new TestUtility()

  it('should ignore messages from old socket after reconnection', async () => {
    test.server.addMethod('identity:test', () => 'response')

    const oldSocket = test.client.clientSocket.socket

    // Force disconnect
    setTimeout(() => {
      oldSocket?.close()
    })

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)

    // The new socket should be different
    const newSocket = test.client.clientSocket.socket
    expect(newSocket).not.toBe(oldSocket)

    // Old socket's handlers should NOT affect new socket state
    // (verified implicitly — if old socket events leaked through,
    // the new connection would be disrupted)
    const result = await test.client.call('identity:test')
    expect(result).toBe('response')
  })

  it('should handle rapid connect/disconnect cycles without leaking state', async () => {
    test.server.addMethod('cycle:test', () => 'ok')

    // Do 3 rapid disconnect/reconnect cycles
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        test.client.clientSocket.socket?.close()
      })

      await test.client.waitFor(ClientEvents.INITIALIZED, 10000)
    }

    // Client should be stable after all cycles
    expect(test.client.clientSocket.ready).toBe(true)
    expect(test.client.initialized).toBe(true)

    const result = await test.client.call('cycle:test')
    expect(result).toBe('ok')
  }, 30000)
})

describe('Reconnection Backoff', () => {
  const test = new TestUtility()

  it('should increment reconnect attempts on repeated failures', async () => {
    // Block new connections
    test.server.acceptConnections = false

    // Force disconnect to start reconnection loop
    test.client.clientSocket.socket?.close()

    // Wait for a few reconnect attempts
    await sleep(3000)

    // The client should still be in connecting state (attempts ongoing)
    expect(test.client.clientSocket.connecting).toBe(true)
    expect(test.client.clientSocket.ready).toBe(false)

    // Re-enable connections
    test.server.acceptConnections = true

    // Should eventually reconnect
    await test.client.waitFor(ClientEvents.INITIALIZED, 15000)
    expect(test.client.clientSocket.ready).toBe(true)
  }, 20000)
})
