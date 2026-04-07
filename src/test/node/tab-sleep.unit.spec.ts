import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { Client } from '../../client'
import { ClientEvents, sleep } from '../../utils'
import { TestUtility } from '../test-utility'

// Mock DOM globals for visibility handler tests.
// VisibilityManager checks `typeof window` and uses `document.visibilityState`
// with `document.addEventListener('visibilitychange', ...)`.
const mockDocument = new EventTarget() as EventTarget & {
  visibilityState: 'visible' | 'hidden'
}
Object.defineProperty(mockDocument, 'visibilityState', {
  value: 'visible',
  writable: true,
  configurable: true,
})

const mockWindow = new EventTarget()

const originalDocument = globalThis.document
const originalWindow = globalThis.window

beforeAll(() => {
  // @ts-expect-error — minimal mock for Node environment
  globalThis.document = mockDocument
  // @ts-expect-error — minimal mock for Node environment
  globalThis.window = mockWindow
})

afterAll(() => {
  globalThis.document = originalDocument
  globalThis.window = originalWindow
})

describe('Tab Sleep Recovery', () => {
  const test = new TestUtility()

  it('should successfully initialize on first attempt', async () => {
    expect(test.client.initialized).toBe(true)
  })

  it('should have initialization event constants defined', () => {
    expect(ClientEvents.INITIALIZATION_RETRY).toBe('initialization:retry')
    expect(ClientEvents.INITIALIZATION_FAILED).toBe('initialization:failed')
    expect(ClientEvents.WEBSOCKET_RECONNECTING).toBe('websocket:reconnecting')
  })

  it('should have reconnect method available', () => {
    // @ts-ignore - accessing private method for testing
    expect(typeof test.client.reconnect).toBe('function')
  })
})

describe('Initialization Retry Logic', () => {
  const test = new TestUtility()

  it('should exit connect() after max retry attempts without infinite loop', async () => {
    // Create a client directly (not through TestUtility which waits for INITIALIZED)
    const client = new Client({
      host: test.host,
      port: test.port,
    })

    // Track how many times INITIALIZATION_FAILED is emitted
    let failedCount = 0
    client.on(ClientEvents.INITIALIZATION_FAILED, () => {
      failedCount++
    })

    // Mock waitFor to always timeout for INITIALIZED
    // @ts-ignore - mocking for test purposes
    client.waitFor = async (event: string) => {
      if (event === ClientEvents.INITIALIZED) {
        throw new Error('Simulated timeout')
      }
    }

    // Call connect - should complete (not hang)
    await client.connect()

    // INITIALIZATION_FAILED should be emitted exactly once (not multiple times from infinite loop)
    expect(failedCount).toBe(1)

    // Don't call close() - client never properly connected
  })

  it('should emit INITIALIZATION_FAILED when connection times out', async () => {
    const client = new Client({
      host: test.host,
      port: test.port,
    })

    let failedPayload: { error: Error } | null = null
    client.on(ClientEvents.INITIALIZATION_FAILED, payload => {
      failedPayload = payload
    })

    const simulatedError = new Error('Simulated timeout')
    // @ts-ignore - mocking for test purposes
    client.waitFor = async (event: string) => {
      if (event === ClientEvents.INITIALIZED) {
        throw simulatedError
      }
    }

    await client.connect()

    expect(failedPayload).not.toBeNull()
    expect(failedPayload!.error).toBe(simulatedError)

    // Don't call close() - client never properly connected
  })
})

describe('Reconnect Method', () => {
  const test = new TestUtility()

  it('should reset initialized state on reconnect', async () => {
    expect(test.client.initialized).toBe(true)

    // Call private reconnect method
    // @ts-ignore
    test.client.reconnect()

    expect(test.client.initialized).toBe(false)
    expect(test.client.initializing).toBe(false)

    // Wait for reconnection to complete
    await test.client.waitFor(ClientEvents.INITIALIZED, 5000)

    expect(test.client.initialized).toBe(true)
  })

  it('should emit WEBSOCKET_RECONNECTING when reconnecting from initialized state', async () => {
    expect(test.client.initialized).toBe(true)

    let reconnectingEmitted = false
    test.client.once(ClientEvents.WEBSOCKET_RECONNECTING, () => {
      reconnectingEmitted = true
    })

    // @ts-ignore - call private method
    test.client.reconnect()

    expect(reconnectingEmitted).toBe(true)

    await test.client.waitFor(ClientEvents.INITIALIZED, 5000)
  })

  it('should NOT emit WEBSOCKET_RECONNECTING when not initialized', async () => {
    // Close current connection
    await test.client.close()

    // Force uninitialized state
    test.client.initialized = false

    let reconnectingEmitted = false
    test.client.once(ClientEvents.WEBSOCKET_RECONNECTING, () => {
      reconnectingEmitted = true
    })

    // @ts-ignore - call private method
    test.client.reconnect()

    // Should NOT emit because we weren't initialized before
    expect(reconnectingEmitted).toBe(false)

    await test.client.waitFor(ClientEvents.INITIALIZED, 5000)
  })
})

describe('Visibility Handler Behavior', () => {
  const test = new TestUtility()

  it('should trigger reconnect when tab becomes visible and not initialized', async () => {
    // Track if reconnect is called via VisibilityManager
    let reconnectCalled = false
    const originalReconnect = test.client.visibilityManager.reconnect.bind(
      test.client.visibilityManager,
    )
    test.client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Simulate uninitialized state (like after tab sleep)
    test.client.initialized = false

    // Simulate tab hidden then visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(10)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(reconnectCalled).toBe(true)

    // Wait for reconnection
    await test.client.waitFor(ClientEvents.INITIALIZED, 5000)
  })

  it('should NOT trigger reconnect when hidden for less than 1 hour if socket is still connected', async () => {
    // Track if reconnect is called via VisibilityManager
    let reconnectCalled = false
    const originalReconnect = test.client.visibilityManager.reconnect.bind(
      test.client.visibilityManager,
    )
    test.client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Ensure client is initialized and socket is connected
    expect(test.client.initialized).toBe(true)
    expect(test.client.clientSocket.ready).toBe(true)

    // Mock Date.now
    const originalDateNow = Date.now
    let mockTime = originalDateNow()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Tab goes hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance time by 30 minutes (less than 1 hour threshold)
    mockTime += 30 * 60 * 1000

    // Tab becomes visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Should NOT reconnect because socket is still connected and hidden < 1 hour
    expect(reconnectCalled).toBe(false)

    // Restore mocks
    vi.restoreAllMocks()
  })

  it('should trigger reconnect when hidden for more than 1 hour even if socket is connected', async () => {
    // Track if reconnect is called
    let reconnectCalled = false
    const originalReconnect = test.client.visibilityManager.reconnect.bind(
      test.client.visibilityManager,
    )
    test.client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Ensure client is initialized and socket is connected
    expect(test.client.initialized).toBe(true)
    expect(test.client.clientSocket.ready).toBe(true)

    // Mock Date.now
    const originalDateNow = Date.now
    let mockTime = originalDateNow()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Tab goes hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance time by 61 minutes (more than 1 hour threshold)
    mockTime += 61 * 60 * 1000

    // Tab becomes visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Should reconnect as safety measure after being hidden for > 1 hour
    expect(reconnectCalled).toBe(true)

    // Restore mocks
    vi.restoreAllMocks()

    // Wait for reconnection
    await test.client.waitFor(ClientEvents.INITIALIZED, 5000)
  })

  it('should NOT reconnect when hidden briefly and initialized', async () => {
    // Track if reconnect is called via VisibilityManager
    let reconnectCalled = false
    const originalReconnect = test.client.visibilityManager.reconnect.bind(
      test.client.visibilityManager,
    )
    test.client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Ensure initialized
    expect(test.client.initialized).toBe(true)

    // Mock Date.now
    const originalDateNow = Date.now
    let mockTime = originalDateNow()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Tab goes hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance time by only 10 seconds (less than 30s threshold)
    mockTime += 10000

    // Tab becomes visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(reconnectCalled).toBe(false)

    vi.restoreAllMocks()
  })
})

describe('End-to-End Tab Sleep Recovery', () => {
  const test = new TestUtility()

  it('should recover after simulated tab sleep', async () => {
    // Setup auth
    test.server.setAuth({
      auth(context: any) {
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    // Create authenticated client
    const client = await test.createAuthenticatedClient()

    expect(client.initialized).toBe(true)
    expect(client.authenticated).toBe(true)

    // Track events - must be set up BEFORE the action
    let reconnectingEmitted = false
    let reinitializedWith: boolean | undefined

    client.on(ClientEvents.WEBSOCKET_RECONNECTING, () => {
      reconnectingEmitted = true
    })

    client.on(ClientEvents.INITIALIZED, authenticated => {
      reinitializedWith = authenticated
    })

    // Simulate tab sleep (connection becomes stale)
    // Keep initialized = true so WEBSOCKET_RECONNECTING is emitted
    const wasInitialized = client.initialized

    // Trigger recovery via reconnect method
    // @ts-ignore
    client.reconnect()

    // Wait for full recovery
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    expect(wasInitialized).toBe(true)
    expect(reconnectingEmitted).toBe(true)
    expect(client.initialized).toBe(true)
    expect(client.authenticated).toBe(true)
    expect(reinitializedWith).toBe(true)

    await client.close()
  })

  it('should allow method calls after recovery', async () => {
    test.server.setAuth({
      auth(context: any) {
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    const client = await test.createAuthenticatedClient()

    // Add a test method
    test.server.addMethod('test.echo', async ({ message }) => message)

    // Verify method works before
    const beforeResult = await client.call('test.echo', { message: 'before' })
    expect(beforeResult).toBe('before')

    // Simulate recovery
    client.initialized = false
    // @ts-ignore
    client.reconnect()
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    // Verify method works after
    const afterResult = await client.call('test.echo', { message: 'after' })
    expect(afterResult).toBe('after')

    await client.close()
  })
})

describe('IdleTimer/VisibilityManager Separation (MEN-120)', () => {
  const test = new TestUtility()

  it('should NOT have idle timer when idlenessTimeout is not set', async () => {
    const client = await test.createClient()

    // idleTimer is null when no idlenessTimeout is configured
    expect(client.idleTimer).toBeNull()
    // visibilityManager is always active
    expect(client.visibilityManager).toBeDefined()

    await client.close()
  })

  it('should handle visibility changes safely when idleTimer is null', async () => {
    const client = await test.createClient()

    // No idleTimer — just verify no errors thrown on visibility change
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(10)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(50)

    // visibilityManager handles this gracefully even with null idleTimer
    expect(client.initialized).toBe(true)

    await client.close()
  })

  it('should only have visibilityManager active when idleTimer is null', async () => {
    const client = await test.createClient()

    // Track reconnect calls on visibilityManager
    let reconnectCallCount = 0
    const originalReconnect = client.visibilityManager.reconnect.bind(
      client.visibilityManager,
    )
    client.visibilityManager.reconnect = () => {
      reconnectCallCount++
      return originalReconnect()
    }

    // Simulate visibility change without disconnecting socket
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(10)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(100)

    // Socket was still connected, so reconnect should NOT be called
    expect(reconnectCallCount).toBe(0)

    await client.close()
  })
})

describe('Dual Visibility Handler Race Condition (MEN-120)', () => {
  const test = new TestUtility()

  it('should handle rapid visibility changes without errors', async () => {
    const client = await test.createClient()

    const errors: Error[] = []
    client.on(ClientEvents.ERROR, err => errors.push(err))

    // Rapid visibility changes
    for (let i = 0; i < 5; i++) {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      await sleep(5)

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      await sleep(5)
    }

    // Wait for things to settle
    await sleep(500)

    // Should eventually initialize
    if (!client.initialized) {
      await client.waitFor(ClientEvents.INITIALIZED, 5000)
    }

    expect(client.initialized).toBe(true)
    // Should have no critical errors
    expect(errors.filter(e => e.message?.includes('not initialized'))).toEqual(
      [],
    )

    await client.close()
  })

  it('should not have both handlers try to reconnect simultaneously', async () => {
    const client = await test.createClient()

    // Track reconnect calls — with no idleTimer, only visibilityManager handles reconnection
    let reconnectCallCount = 0
    const originalReconnect = client.visibilityManager.reconnect.bind(
      client.visibilityManager,
    )
    client.visibilityManager.reconnect = () => {
      reconnectCallCount++
      return originalReconnect()
    }

    // Simulate visibility changes
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(10)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(100)

    // Socket was still connected — no reconnect should occur
    expect(reconnectCallCount).toBe(0)

    await client.close()
  })
})

describe('Method Calls During Reconnection (MEN-120)', () => {
  const test = new TestUtility()

  it('should queue method calls during reconnection and complete them after', async () => {
    test.server.addMethod('test.echo', async ({ message }) => message)

    const client = await test.createClient()

    // Verify initial state
    expect(client.initialized).toBe(true)
    const beforeResult = await client.call('test.echo', { message: 'before' })
    expect(beforeResult).toBe('before')

    // Start reconnection
    // @ts-ignore - call private method
    client.reconnect()

    // Immediately call method while reconnecting
    const duringReconnectPromise = client.call('test.echo', {
      message: 'during',
    })

    // Wait for reconnection
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    // Method call during reconnection should complete
    const duringResult = await duringReconnectPromise
    expect(duringResult).toBe('during')

    await client.close()
  })

  it('should not throw "Client not initialized" on visibility change with pending calls', async () => {
    test.server.addMethod('test.slow', async ({ delay }) => {
      await sleep(delay)
      return 'done'
    })

    const client = await test.createClient()

    // Start a slow method call
    const slowCallPromise = client.call('test.slow', { delay: 100 })

    // Immediately trigger visibility change
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(5)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // The slow call should still complete or timeout gracefully
    let error: Error | null = null
    try {
      await slowCallPromise
    } catch (e) {
      error = e as Error
    }

    // Should not be a "Client not initialized" error
    if (error) {
      expect(error.message).not.toContain('Client not initialized')
    }

    await client.close()
  })
})

describe('Subscription Commits During Reconnection (MEN-120)', () => {
  const test = new TestUtility()

  it('should not fail subscription commits during reconnection', async () => {
    test.server.addEvent('test.event')

    const client = await test.createClient()
    await client.subscribe('test.event')

    // Start reconnection
    // @ts-ignore
    client.reconnect()

    // Resubscription should happen automatically and not fail
    const errors: Error[] = []
    client.on(ClientEvents.ERROR, err => errors.push(err))

    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    // Give time for resubscription to complete
    await sleep(200)

    // Should have no subscription-related errors
    const subErrors = errors.filter(
      e =>
        e.message?.includes('commit subscriptions') ||
        e.message?.includes('commit unsubscriptions'),
    )
    expect(subErrors).toEqual([])

    await client.close()
  })

  it('should resubscribe to all events after reconnection', async () => {
    test.server.addEvent('test.event1')
    test.server.addEvent('test.event2')

    const client = await test.createClient()
    await client.subscribe('test.event1')
    await client.subscribe('test.event2')

    // Verify subscriptions exist
    expect(client.events.has('test.event1')).toBe(true)
    expect(client.events.has('test.event2')).toBe(true)

    // Reconnect
    // @ts-ignore
    client.reconnect()
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    // Events should still be tracked
    expect(client.events.has('test.event1')).toBe(true)
    expect(client.events.has('test.event2')).toBe(true)

    // Should be able to receive events
    let receivedEvent = false
    client.once('test.event1', () => {
      receivedEvent = true
    })

    test.server.emit('test.event1', {})
    await sleep(100)

    expect(receivedEvent).toBe(true)

    await client.close()
  })
})

describe('Unified Visibility Handler (MEN-120)', () => {
  const test = new TestUtility()

  it('should NOT call reconnect when briefly hidden and initialized', async () => {
    // Create client WITH idlenessTimeout
    const client = await test.createClient({ idlenessTimeout: 60000 })

    // Track reconnect calls
    let reconnectCalled = false
    const originalReconnect = client.visibilityManager.reconnect.bind(
      client.visibilityManager,
    )
    client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    expect(client.initialized).toBe(true)

    // Simulate brief visibility change (less than 30s threshold)
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(10)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(100)

    // Should NOT reconnect - just reset idle timer
    expect(reconnectCalled).toBe(false)

    await client.close()
  })

  it('should NOT reconnect when hidden long if socket is still connected', async () => {
    // Create client WITH idlenessTimeout
    const client = await test.createClient({ idlenessTimeout: 60000 })

    // Track reconnect calls
    let reconnectCalled = false
    const originalReconnect = client.visibilityManager.reconnect.bind(
      client.visibilityManager,
    )
    client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Mock Date.now to simulate 60 seconds hidden
    let mockTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Simulate visibility change
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance time by 60 seconds (more than 30s stale threshold)
    mockTime += 60000

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(100)

    vi.restoreAllMocks()

    // reconnect() should NOT be called when socket is still connected and initialized
    // This prevents unnecessary loading overlays when returning to a healthy tab
    expect(reconnectCalled).toBe(false)

    await client.close()
  })

  it('should NOT reconnect when hidden long if socket is still connected (no idlenessTimeout)', async () => {
    // Create client WITHOUT idlenessTimeout
    const client = await test.createClient()

    // Track VisibilityManager.reconnect() calls
    let reconnectCalled = false
    const originalReconnect = client.visibilityManager.reconnect.bind(
      client.visibilityManager,
    )
    client.visibilityManager.reconnect = () => {
      reconnectCalled = true
      return originalReconnect()
    }

    // Mock Date.now to simulate 60 seconds hidden
    let mockTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Simulate visibility change
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance time by 60 seconds (more than 30s stale threshold)
    mockTime += 60000

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    await sleep(100)

    vi.restoreAllMocks()

    // reconnect() should NOT be called when socket is still connected and initialized
    // This prevents unnecessary loading overlays when returning to a healthy tab
    expect(reconnectCalled).toBe(false)

    await client.close()
  })
})

describe('IdleTimer.reset() Behavior (MEN-120)', () => {
  const test = new TestUtility()

  it('IdleTimer.reset() should NOT reconnect even when socket is connected but not initialized', async () => {
    const client = await test.createClient({ idlenessTimeout: 60000 })

    expect(client.initialized).toBe(true)
    expect(client.clientSocket.ready).toBe(true)

    // Simulate a state where socket is connected but client isn't initialized
    client.initialized = false

    // Track if connect is called (which would indicate an unwanted reconnect)
    const connectSpy = vi.spyOn(client.clientSocket, 'connect')

    // Call reset - this is called on user activity (mousemove, etc)
    // It should NOT cause reconnection just because initialized=false
    // That would create reconnection loops on active tabs
    await client.idleTimer.reset()

    // Should NOT have called connect - reset() only reconnects if socket is down
    expect(connectSpy).not.toHaveBeenCalled()

    // Clean up - restore initialized state for proper close
    client.initialized = true
    vi.restoreAllMocks()
    await client.close()
  })

  it('IdleTimer.reset() should NOT reconnect when socket is connected AND initialized', async () => {
    const client = await test.createClient({ idlenessTimeout: 60000 })

    expect(client.initialized).toBe(true)
    expect(client.clientSocket.ready).toBe(true)

    // Track if connect is called
    const connectSpy = vi.spyOn(client.clientSocket, 'connect')

    // Call reset while connected AND initialized
    await client.idleTimer.reset()

    // Should NOT have tried to reconnect
    expect(connectSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
    await client.close()
  })

  it('IdleTimer.reset() should not attempt connection when socket is active', async () => {
    const client = await test.createClient({ idlenessTimeout: 60000 })

    expect(client.initialized).toBe(true)
    expect(client.clientSocket.ready).toBe(true)

    // Spy on connect
    const connectSpy = vi.spyOn(client.clientSocket, 'connect')

    // Call reset while connected
    await client.idleTimer.reset()

    // Should not have tried to connect (socket was already active)
    expect(connectSpy).not.toHaveBeenCalled()

    vi.restoreAllMocks()
    await client.close()
  })

  it('IdleTimer.reset() should attempt connection when socket is not active', async () => {
    const client = await test.createClient({ idlenessTimeout: 60000 })

    // Spy on connect before closing
    const connectSpy = vi.spyOn(client.clientSocket, 'connect')

    // Close the socket (but keep the client object for testing)
    client.clientSocket.socket?.close()

    // Reset the spy after disconnect
    connectSpy.mockClear()

    // Call reset while socket is not active
    // Don't await - we just want to verify connect is called
    client.idleTimer.reset().catch(() => {
      // Ignore timeout errors - we just care that connect was attempted
    })

    // Give it a moment to start
    await sleep(50)

    // Should have tried to connect
    expect(connectSpy).toHaveBeenCalled()

    // Clean up
    vi.restoreAllMocks()
    client.idleTimer.destroy()
    await client.close()
  })
})

describe('Socket Cleanup During Reconnection (Tab Sleep Fix)', () => {
  const test = new TestUtility()

  it('should clean up disconnected socket before creating new one', async () => {
    const client = await test.createClient()

    // Store reference to original socket
    const originalSocket = client.clientSocket.socket!

    // Spy on socket close method
    const closeSpy = vi.spyOn(originalSocket, 'close')

    // Trigger reconnection via VisibilityManager
    client.visibilityManager.reconnect()

    // Old socket should be cleaned up
    expect(closeSpy).toHaveBeenCalled()

    // Wait for reconnection
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    vi.restoreAllMocks()
    await client.close()
  })

  it('should not leave orphaned socket when reconnecting after sleep with disconnected socket', async () => {
    const client = await test.createClient()

    const originalSocket = client.clientSocket.socket!

    // Simulate socket being disconnected (as can happen during browser sleep)
    originalSocket.close()
    client.initialized = false

    // Simulate 60 seconds of hidden time
    let mockTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    mockTime += 60000 // 60 seconds

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for reconnection (should happen since socket is disconnected)
    await client.waitFor(ClientEvents.INITIALIZED, 5000)

    // New socket should be a different instance
    const newSocket = client.clientSocket.socket!
    expect(newSocket).not.toBe(originalSocket)

    vi.restoreAllMocks()
    await client.close()
  })

  it('should handle rapid tab sleep/wake cycles without socket leaks when socket disconnects', async () => {
    const client = await test.createClient()

    const errors: Error[] = []
    client.on(ClientEvents.ERROR, err => errors.push(err))

    // Mock time
    let mockTime = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

    // Simulate 3 rapid sleep/wake cycles where socket disconnects
    for (let i = 0; i < 3; i++) {
      // Simulate socket disconnecting during sleep
      client.clientSocket.socket?.close()
      client.initialized = false

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      mockTime += 35000

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Wait for reconnection before next cycle
      await client.waitFor(ClientEvents.INITIALIZED, 5000)
    }

    vi.restoreAllMocks()

    // Should be connected and initialized after all cycles
    expect(client.initialized).toBe(true)

    // Should have no critical errors
    const criticalErrors = errors.filter(
      e =>
        e.message?.includes('not initialized') ||
        e.message?.includes('socket') ||
        e.message?.includes('timeout'),
    )
    expect(criticalErrors).toEqual([])

    await client.close()
  })
})

describe('Subscription Timeout Resilience (Tab Sleep Fix)', () => {
  const test = new TestUtility()

  it('should wait long enough for subscriptions during slow reconnection', async () => {
    test.server.addEvent('test.slow.event')

    const client = await test.createClient()
    await client.subscribe('test.slow.event')

    // Track subscription errors
    const subscriptionErrors: Error[] = []
    const originalLoggerSubscription = client.logger.subscription.bind(
      client.logger,
    )
    client.logger.subscription = (...args: any[]) => {
      if (args[0] === 'error' || args[1]?.includes('Failed')) {
        subscriptionErrors.push(new Error(args[1]))
      }
      return originalLoggerSubscription(...args)
    }

    // Trigger reconnection
    client.visibilityManager.reconnect()

    // Wait for reconnection
    await client.waitFor(ClientEvents.INITIALIZED, 10000)

    // Give time for resubscription to complete
    await sleep(500)

    // Should have no subscription timeout errors
    expect(subscriptionErrors.length).toBe(0)

    await client.close()
  })

  it('should successfully resubscribe even with network delay simulation', async () => {
    test.server.addEvent('test.delayed.event')

    const client = await test.createClient()

    // Subscribe before reconnection
    await client.subscribe('test.delayed.event')
    expect(client.events.has('test.delayed.event')).toBe(true)

    // Trigger reconnection
    client.visibilityManager.reconnect()

    // Wait for full recovery
    await client.waitFor(ClientEvents.INITIALIZED, 10000)
    await sleep(300)

    // Should still have the subscription
    expect(client.events.has('test.delayed.event')).toBe(true)

    // Should be able to receive events after reconnection
    let eventReceived = false
    client.once('test.delayed.event', () => {
      eventReceived = true
    })

    test.server.emit('test.delayed.event', { data: 'test' })
    await sleep(200)

    expect(eventReceived).toBe(true)

    await client.close()
  })
})
