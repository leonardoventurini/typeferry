// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useSubscribe } from './use-subscribe'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

function createMockChannel(overrides = {}) {
  return {
    on: vi.fn(),
    off: vi.fn(),
    subscribe: vi.fn().mockResolvedValue({}),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    _events: {},
    ...overrides,
  }
}

function createMockClient(overrides = {}) {
  const channel = createMockChannel()
  return {
    authenticated: false,
    isOffline: true,
    isOnline: false,
    isConnecting: false,
    context: {},
    channel: vi.fn().mockReturnValue(channel),
    call: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    visibilityManager: { onBeforeReconnect: null },
    updateContext: vi.fn(),
    clearContext: vi.fn(),
    logger: { debug: vi.fn() },
    _channel: channel,
    ...overrides,
  }
}

describe('useSubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws if event is not a string', () => {
    mockClientRef.current = createMockClient()

    expect(() => {
      renderHook(() =>
        useSubscribe({ event: undefined as any }),
      )
    }).toThrow('event name is required')
  })

  it('throws if event is a number', () => {
    mockClientRef.current = createMockClient()

    expect(() => {
      renderHook(() =>
        useSubscribe({ event: 123 as any }),
      )
    }).toThrow('event name is required')
  })

  it('subscribes to event on mount', async () => {
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() =>
      useSubscribe({ event: 'test-event', channel: 'test-channel' }),
    )

    expect(client.channel).toHaveBeenCalledWith('test-channel')
    expect(client._channel.subscribe).toHaveBeenCalledWith('test-event')
  })

  it('registers callback on channel event', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const callback = vi.fn()

    renderHook(() =>
      useSubscribe(
        { event: 'test-event', channel: 'test-channel' },
        callback,
      ),
    )

    expect(client._channel.on).toHaveBeenCalledWith('test-event', callback)
  })

  it('cleans up callback on unmount', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const callback = vi.fn()

    const { unmount } = renderHook(() =>
      useSubscribe(
        { event: 'test-event', channel: 'test-channel' },
        callback,
      ),
    )

    unmount()

    expect(client._channel.off).toHaveBeenCalledWith('test-event', callback)
  })

  it('skips subscription when active=false', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const callback = vi.fn()

    renderHook(() =>
      useSubscribe(
        { event: 'test-event', channel: 'test-channel', active: false },
        callback,
      ),
    )

    expect(client._channel.on).not.toHaveBeenCalled()
    expect(client._channel.subscribe).not.toHaveBeenCalled()
  })

  it('returns ready=false initially', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { result } = renderHook(() =>
      useSubscribe({ event: 'test-event', channel: 'test-channel' }),
    )

    expect(result.current).toBe(false)
  })

  it('returns ready=true after subscribe resolves with truthy value', async () => {
    const client = createMockClient()
    client._channel.subscribe.mockResolvedValue({ 'test-event': true })
    mockClientRef.current = client

    const { result } = renderHook(() =>
      useSubscribe({ event: 'test-event', channel: 'test-channel' }),
    )

    // Wait for the promise to resolve
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toBe(true)
  })

  it('does not register callback when callback is null', () => {
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() =>
      useSubscribe({ event: 'test-event', channel: 'test-channel' }, null),
    )

    expect(client._channel.on).not.toHaveBeenCalled()
  })

  it('does not re-register callback if already registered', () => {
    const callback = vi.fn()
    const client = createMockClient()
    client._channel._events = { 'test-event': callback }
    mockClientRef.current = client

    renderHook(() =>
      useSubscribe(
        { event: 'test-event', channel: 'test-channel' },
        callback,
      ),
    )

    expect(client._channel.on).not.toHaveBeenCalled()
  })

  it('does not re-register callback if already in event array', () => {
    const callback = vi.fn()
    const client = createMockClient()
    client._channel._events = { 'test-event': [callback, vi.fn()] }
    mockClientRef.current = client

    renderHook(() =>
      useSubscribe(
        { event: 'test-event', channel: 'test-channel' },
        callback,
      ),
    )

    expect(client._channel.on).not.toHaveBeenCalled()
  })

  it('uses NO_CHANNEL as default channel', () => {
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() => useSubscribe({ event: 'test-event' }))

    expect(client.channel).toHaveBeenCalledWith('NO_CHANNEL')
  })

  it('schedules unsubscribe after unmount when no listeners remain', () => {
    const client = createMockClient()
    client._channel._events = {}
    mockClientRef.current = client

    const { unmount } = renderHook(() =>
      useSubscribe({ event: 'test-event', channel: 'test-channel' }),
    )

    unmount()

    // Unsubscribe is deferred by setTimeout(1000)
    expect(client._channel.unsubscribe).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(client._channel.unsubscribe).toHaveBeenCalledWith('test-event')
  })
})
