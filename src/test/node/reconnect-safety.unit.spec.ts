import { describe, expect, it, vi } from 'vitest'

import { sleep } from '../../utils'
import { TestUtility } from '../test-utility'

/**
 * Tests that reconnection logic doesn't create runaway socket storms.
 * These tests guard against the infinite loop that crashed Chrome tabs
 * when the server was unreachable.
 */
describe('Reconnection Safety', () => {
  const test = new TestUtility()

  it('should not create more than MAX_RECONNECT_ATTEMPTS sockets when server refuses', async () => {
    // Block connections
    test.server.acceptConnections = false

    // Track socket creation
    const createSocketSpy = vi.spyOn(
      test.client.clientSocket as unknown as Record<string, unknown>,
      'createSocket' as never,
    )

    // Force disconnect to trigger reconnection
    test.client.clientSocket.socket?.close()

    // Wait for reconnection attempts to play out (with backoff)
    await sleep(5000)

    // Should have created at most ~10 sockets (MAX_RECONNECT_ATTEMPTS)
    // plus the VisibilityManager's one additional attempt
    // MAX_RECONNECT_ATTEMPTS (10) + 1 from VisibilityManager
    const callCount = (
      createSocketSpy as unknown as { mock: { calls: unknown[] } }
    ).mock.calls.length
    expect(callCount).toBeLessThanOrEqual(12)

    // Restore and cleanup
    test.server.acceptConnections = true
    vi.restoreAllMocks()
  }, 15000)

  it('should eventually stop creating new sockets when server is down', async () => {
    test.server.acceptConnections = false

    let totalSockets = 0
    const origCreate = (
      test.client.clientSocket as unknown as Record<string, () => void>
    )['createSocket']
    ;(test.client.clientSocket as unknown as Record<string, () => void>)[
      'createSocket'
    ] = function (this: unknown) {
      totalSockets++
      return origCreate.call(this)
    }

    // Force disconnect to start reconnection
    test.client.clientSocket.socket?.close()

    // Wait for all retries + VisibilityManager cycle
    await sleep(10000)

    const countAfterExhaustion = totalSockets

    // Wait more — count should stabilize (no infinite growth)
    await sleep(3000)

    // At most a few more from the VM cycle, but not unbounded
    expect(totalSockets - countAfterExhaustion).toBeLessThanOrEqual(2)

    test.server.acceptConnections = true
    vi.restoreAllMocks()
  }, 20000)

  it('Client.connect() should not compete with ClientSocket reconnection', async () => {
    const client = await test.createClient()

    // Track how many times createSocket is called
    let socketCount = 0
    const originalConnect = client.clientSocket.connect.bind(
      client.clientSocket,
    )
    client.clientSocket.connect = () => {
      socketCount++
      return originalConnect()
    }

    // Close and reconnect
    await client.close()
    socketCount = 0

    // connect() should call clientSocket.connect() exactly once
    await client.connect()

    // Only 1 call from connect(), no competing retry loop
    expect(socketCount).toBe(1)

    await client.close()
  })

  it('setContextAndReInit should cancel pending reconnection timers', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })
    server.setAuth({
      auth(ctx) {
        return ctx?.token ? { ...ctx, user: { _id: 'u1' } } : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    const client = await test.createAuthenticatedClient({ port: server.port })

    // Force a disconnect to start reconnection timer
    client.clientSocket.socket?.close()
    await sleep(100)

    // Now setContextAndReInit — should cancel the timer, not race with it
    let socketCreations = 0
    const origCreate = (
      client.clientSocket as unknown as Record<string, unknown>
    )['createSocket'] as () => void
    ;(client.clientSocket as unknown as Record<string, unknown>)[
      'createSocket'
    ] = function (this: unknown) {
      socketCreations++
      return origCreate.call(this)
    }

    await client.setContextAndReInit({ token: 'test' })

    // Should have created exactly 1 new socket (from setContextAndReInit)
    // not multiple from competing reconnection
    expect(socketCreations).toBe(1)

    await client.close()
    await server.close()
  })
})
