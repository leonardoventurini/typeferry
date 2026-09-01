import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientEvents } from '../utils'
import { VisibilityManager } from './visibility-manager'

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop(): void {}

function createMockClient() {
  return {
    options: { debug: false, ws: {} },
    initialized: true,
    initializing: false,
    clientSocket: {
      socket: {
        readyState: WebSocket.OPEN,
        close: vi.fn(),
      } as Record<string, unknown>,
      connect: vi.fn(),
    },
    close: vi.fn(),
    emit: vi.fn(),
  }
}

function createMockIdleTimer() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    destroy: vi.fn(),
  }
}

// Set up DOM globals for visibility tests
const mockDocument = new EventTarget() as EventTarget & {
  visibilityState: 'visible' | 'hidden'
}
Object.defineProperty(mockDocument, 'visibilityState', {
  value: 'visible',
  writable: true,
  configurable: true,
})

const originalDocument = globalThis.document
const originalWindow = globalThis.window

describe('VisibilityManager', () => {
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    // @ts-expect-error — minimal mock for Node environment
    globalThis.document = mockDocument
    // @ts-expect-error — minimal mock for Node environment
    globalThis.window = new EventTarget()

    mockClient = createMockClient()
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.window = originalWindow
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should reconnect when tab becomes visible and socket is disconnected', () => {
    mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
    mockClient.initialized = true

    const manager = new VisibilityManager(mockClient as never, null)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClient.clientSocket.connect).toHaveBeenCalled()
    expect(mockClient.emit).toHaveBeenCalledWith(
      ClientEvents.WEBSOCKET_RECONNECTING,
    )

    manager.destroy()
  })

  it('should NOT reconnect when briefly hidden and socket is still connected', () => {
    const manager = new VisibilityManager(mockClient as never, null)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClient.clientSocket.connect).not.toHaveBeenCalled()

    manager.destroy()
  })

  it('should reconnect when hidden for more than 1 hour', () => {
    const manager = new VisibilityManager(mockClient as never, null)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance past the 1-hour threshold
    vi.advanceTimersByTime(61 * 60 * 1000)

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClient.clientSocket.connect).toHaveBeenCalled()

    manager.destroy()
  })

  it('should reset idle timer on visibility restore when connected', () => {
    const idleTimer = createMockIdleTimer()
    const manager = new VisibilityManager(
      mockClient as never,
      idleTimer as never,
    )

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(idleTimer.stop).toHaveBeenCalled()
    expect(idleTimer.start).toHaveBeenCalled()
    expect(mockClient.clientSocket.connect).not.toHaveBeenCalled()

    manager.destroy()
  })

  it('should emit WEBSOCKET_RECONNECTING only when previously initialized', () => {
    mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
    mockClient.initialized = false

    const manager = new VisibilityManager(mockClient as never, null)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClient.emit).not.toHaveBeenCalledWith(
      ClientEvents.WEBSOCKET_RECONNECTING,
    )

    manager.destroy()
  })

  it('should clean up existing socket before reconnecting', () => {
    const originalSocket = mockClient.clientSocket.socket

    const manager = new VisibilityManager(mockClient as never, null)

    manager.reconnect()

    expect(originalSocket.close).toHaveBeenCalled()
    expect(mockClient.clientSocket.connect).toHaveBeenCalled()

    manager.destroy()
  })

  it('should disconnect on page hide when configured', () => {
    mockClient.options.ws = { disconnectOnPageHide: true }

    const manager = new VisibilityManager(mockClient as never, null)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClient.close).toHaveBeenCalled()

    manager.destroy()
  })

  it('destroy() should remove the visibility listener', () => {
    const manager = new VisibilityManager(mockClient as never, null)

    const removeSpy = vi.spyOn(document, 'removeEventListener')

    manager.destroy()

    expect(removeSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })

  describe('onBeforeReconnect hook', () => {
    it('should call onBeforeReconnect before reconnecting on visibility restore', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
      const callOrder: string[] = []

      const hook = vi.fn(async () => {
        callOrder.push('hook')
      })
      mockClient.clientSocket.connect = vi.fn(() => {
        callOrder.push('connect')
      })

      const manager = new VisibilityManager(mockClient as never, null)
      manager.onBeforeReconnect = hook

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      expect(hook).toHaveBeenCalledTimes(1)
      expect(callOrder).toEqual(['hook', 'connect'])

      manager.destroy()
    })

    it('should still reconnect when onBeforeReconnect throws all retries', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED

      const manager = new VisibilityManager(mockClient as never, null)
      manager.onBeforeReconnect = vi.fn(async () => {
        throw new Error('refresh failed')
      })

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Advance through retry delays (2 retries × 2s each)
      await vi.advanceTimersByTimeAsync(2_000)
      await vi.advanceTimersByTimeAsync(2_000)

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      // Hook called 3 times (initial + 2 retries)
      expect(manager.onBeforeReconnect).toHaveBeenCalledTimes(3)

      manager.destroy()
    })

    it('should not call onBeforeReconnect when no reconnect is needed', () => {
      const hook = vi.fn()

      const manager = new VisibilityManager(mockClient as never, null)
      manager.onBeforeReconnect = hook

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      expect(hook).not.toHaveBeenCalled()

      manager.destroy()
    })
  })

  describe('heartbeat sleep detector', () => {
    it('should detect sleep when gap exceeds threshold', async () => {
      const baseTime = Date.now()
      const dateNow = vi.spyOn(Date, 'now')

      // Constructor captures lastHeartbeat at baseTime
      dateNow.mockReturnValue(baseTime)
      const manager = new VisibilityManager(mockClient as never, null)

      // Simulate OS sleep: when the next interval fires, Date.now()
      // jumps 90s ahead (JS event loop was frozen)
      dateNow.mockReturnValue(baseTime + 90_000)
      vi.advanceTimersByTime(30_000)

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      manager.destroy()
    })

    it('should not trigger on normal 30s intervals', () => {
      const baseTime = Date.now()
      const dateNow = vi.spyOn(Date, 'now')

      dateNow.mockReturnValue(baseTime)
      const manager = new VisibilityManager(mockClient as never, null)

      // Normal tick: 30s elapsed, 30s gap — below 60s threshold
      dateNow.mockReturnValue(baseTime + 30_000)
      vi.advanceTimersByTime(30_000)

      expect(mockClient.clientSocket.connect).not.toHaveBeenCalled()

      manager.destroy()
    })

    it('should deduplicate when heartbeat and visibility both fire', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
      const baseTime = Date.now()
      const dateNow = vi.spyOn(Date, 'now')

      dateNow.mockReturnValue(baseTime)
      const manager = new VisibilityManager(mockClient as never, null)

      // Add a slow hook so the dedup guard is active when the second signal fires
      let resolveHook: () => void = noop
      const hookPromise = new Promise<void>(r => {
        resolveHook = r
      })
      manager.onBeforeReconnect = vi.fn(() => hookPromise)

      // Heartbeat fires first (sleep detected) — starts async hook
      dateNow.mockReturnValue(baseTime + 90_000)
      vi.advanceTimersByTime(30_000)

      // Visibility fires while hook is still running — dedup guard blocks it
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Resolve the hook to allow reconnect to complete
      resolveHook()

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      // Only one reconnect despite both signals
      expect(mockClient.clientSocket.connect).toHaveBeenCalledTimes(1)

      manager.destroy()
    })

    it('should deduplicate when visibility fires first', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
      const baseTime = Date.now()
      const dateNow = vi.spyOn(Date, 'now')

      dateNow.mockReturnValue(baseTime)
      const manager = new VisibilityManager(mockClient as never, null)

      // Add a slow hook so dedup guard is active for the heartbeat
      let resolveHook: () => void = noop
      const hookPromise = new Promise<void>(r => {
        resolveHook = r
      })
      manager.onBeforeReconnect = vi.fn(() => hookPromise)

      // Visibility fires first — starts async hook
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Heartbeat fires while hook is still running — dedup blocks it
      dateNow.mockReturnValue(baseTime + 90_000)
      vi.advanceTimersByTime(30_000)

      // Resolve hook
      resolveHook()

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      expect(mockClient.clientSocket.connect).toHaveBeenCalledTimes(1)

      manager.destroy()
    })

    it('should clean up heartbeat timer on destroy', () => {
      const clearSpy = vi.spyOn(globalThis, 'clearInterval')
      const manager = new VisibilityManager(mockClient as never, null)

      manager.destroy()

      expect(clearSpy).toHaveBeenCalled()
    })
  })

  describe('hook retry', () => {
    it('should succeed on second attempt after first failure', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED
      let callCount = 0

      const manager = new VisibilityManager(mockClient as never, null)
      manager.onBeforeReconnect = vi.fn(async () => {
        callCount++
        if (callCount === 1) throw new Error('network not ready')
      })

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Advance through first retry delay
      await vi.advanceTimersByTimeAsync(2_000)

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      expect(manager.onBeforeReconnect).toHaveBeenCalledTimes(2)

      manager.destroy()
    })

    it('should reconnect after all retry attempts fail', async () => {
      mockClient.clientSocket.socket.readyState = WebSocket.CLOSED

      const manager = new VisibilityManager(mockClient as never, null)
      manager.onBeforeReconnect = vi.fn(async () => {
        throw new Error('network down')
      })

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(2_000)
      await vi.advanceTimersByTimeAsync(2_000)

      await vi.waitFor(() => {
        expect(mockClient.clientSocket.connect).toHaveBeenCalled()
      })

      // 3 attempts total (initial + 2 retries)
      expect(manager.onBeforeReconnect).toHaveBeenCalledTimes(3)

      manager.destroy()
    })
  })
})
