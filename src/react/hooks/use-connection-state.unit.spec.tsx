// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ClientEvents } from '../../utils'
import { useConnectionState } from './use-connection-state'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

let capturedThrottledCallback: (...args: any[]) => void
let capturedThrottledEvents: string[]

vi.mock('./use-throttled-events', () => ({
  useThrottledEvents: (
    _emitter: any,
    events: string[],
    callback: (...args: any[]) => void,
  ) => {
    capturedThrottledEvents = events
    capturedThrottledCallback = callback
  },
}))

function createMockClient(overrides = {}) {
  return {
    authenticated: false,
    isOffline: true,
    isOnline: false,
    isConnecting: false,
    context: {},
    channel: vi.fn().mockReturnValue({
      on: vi.fn(),
      off: vi.fn(),
      subscribe: vi.fn().mockResolvedValue({}),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      _events: {},
    }),
    call: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    visibilityManager: { onBeforeReconnect: null },
    updateContext: vi.fn(),
    clearContext: vi.fn(),
    logger: { debug: vi.fn() },
    ...overrides,
  }
}

describe('useConnectionState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedThrottledCallback = undefined as any
    capturedThrottledEvents = undefined as any
  })

  it('returns initial state reflecting client state', () => {
    mockClientRef.current = createMockClient({
      isOffline: true,
      isOnline: false,
      isConnecting: false,
    })

    const { result } = renderHook(() => useConnectionState())

    expect(result.current.isOffline).toBe(true)
    expect(result.current.isOnline).toBe(false)
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.isReconnecting).toBe(false)
  })

  it('returns online state when client is online', () => {
    mockClientRef.current = createMockClient({
      isOffline: false,
      isOnline: true,
      isConnecting: false,
    })

    const { result } = renderHook(() => useConnectionState())

    expect(result.current.isOffline).toBe(false)
    expect(result.current.isOnline).toBe(true)
    expect(result.current.isConnecting).toBe(false)
  })

  it('registers throttled events for INITIALIZED, WEBSOCKET_CLOSED, CONNECTING', () => {
    mockClientRef.current = createMockClient()

    renderHook(() => useConnectionState())

    expect(capturedThrottledEvents).toEqual([
      ClientEvents.INITIALIZED,
      ClientEvents.WEBSOCKET_CLOSED,
      ClientEvents.CONNECTING,
    ])
  })

  it('updates state when throttled callback is invoked (simulating INITIALIZED event)', () => {
    const client = createMockClient({
      isOffline: true,
      isOnline: false,
      isConnecting: false,
    })
    mockClientRef.current = client

    const { result } = renderHook(() => useConnectionState())

    expect(result.current.isOffline).toBe(true)
    expect(result.current.isOnline).toBe(false)

    // Simulate the client state changing before the event fires
    client.isOffline = false
    client.isOnline = true
    client.isConnecting = false

    act(() => {
      capturedThrottledCallback()
    })

    expect(result.current.isOffline).toBe(false)
    expect(result.current.isOnline).toBe(true)
    expect(result.current.isConnecting).toBe(false)
  })

  it('registers listeners for WEBSOCKET_RECONNECTING and INITIALIZED on client', () => {
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() => useConnectionState())

    expect(client.on).toHaveBeenCalledWith(
      ClientEvents.WEBSOCKET_RECONNECTING,
      expect.any(Function),
    )
    expect(client.on).toHaveBeenCalledWith(
      ClientEvents.INITIALIZED,
      expect.any(Function),
    )
  })

  it('sets isReconnecting=true on WEBSOCKET_RECONNECTING event', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { result } = renderHook(() => useConnectionState())

    // Find the onReconnecting callback
    const reconnectingCall = client.on.mock.calls.find(
      (call: any[]) => call[0] === ClientEvents.WEBSOCKET_RECONNECTING,
    )
    const onReconnecting = reconnectingCall[1]

    act(() => {
      onReconnecting()
    })

    expect(result.current.isReconnecting).toBe(true)
  })

  it('sets isReconnecting=false on INITIALIZED event after reconnecting', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { result } = renderHook(() => useConnectionState())

    const reconnectingCall = client.on.mock.calls.find(
      (call: any[]) => call[0] === ClientEvents.WEBSOCKET_RECONNECTING,
    )
    const onReconnecting = reconnectingCall[1]

    const initializedCall = client.on.mock.calls.find(
      (call: any[]) => call[0] === ClientEvents.INITIALIZED,
    )
    const onConnected = initializedCall[1]

    act(() => {
      onReconnecting()
    })
    expect(result.current.isReconnecting).toBe(true)

    act(() => {
      onConnected()
    })
    expect(result.current.isReconnecting).toBe(false)
  })

  it('cleans up WEBSOCKET_RECONNECTING and INITIALIZED listeners on unmount', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { unmount } = renderHook(() => useConnectionState())

    unmount()

    expect(client.off).toHaveBeenCalledWith(
      ClientEvents.WEBSOCKET_RECONNECTING,
      expect.any(Function),
    )
    expect(client.off).toHaveBeenCalledWith(
      ClientEvents.INITIALIZED,
      expect.any(Function),
    )
  })
})
