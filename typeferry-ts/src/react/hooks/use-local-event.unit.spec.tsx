// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useLocalEvent, useRemoteEvent } from './use-local-event'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

let capturedSubscribeParams: any
let capturedSubscribeCallback: any

vi.mock('./use-subscribe', () => ({
  useSubscribe: (params: any, fn: any, deps: any) => {
    capturedSubscribeParams = params
    capturedSubscribeCallback = fn
    return false
  },
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

describe('useLocalEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSubscribeParams = undefined
    capturedSubscribeCallback = undefined
  })

  it('subscribes to event on client when params is a string', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const fn = vi.fn()

    renderHook(() => useLocalEvent('my-event', fn))

    // When channel is NO_CHANNEL (not a string match for the conditional
    // `typeof channel === 'string'`), it still resolves to client.channel(channel)
    // But NO_CHANNEL is a string, so it calls client.channel('NO_CHANNEL')
    // Actually looking at the code: `typeof channel === 'string' ? client.channel(channel) : client`
    // Since NO_CHANNEL = 'NO_CHANNEL' (a string), it calls client.channel('NO_CHANNEL')
    expect(client.channel).toHaveBeenCalledWith('NO_CHANNEL')
    expect(client._channel.on).toHaveBeenCalledWith(
      'my-event',
      expect.any(Function),
    )
  })

  it('subscribes to event on specific channel when object params with channel', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const fn = vi.fn()

    renderHook(() =>
      useLocalEvent({ event: 'my-event', channel: 'my-channel' }, fn),
    )

    expect(client.channel).toHaveBeenCalledWith('my-channel')
    expect(client._channel.on).toHaveBeenCalledWith(
      'my-event',
      expect.any(Function),
    )
  })

  it('does not subscribe when active=false', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const fn = vi.fn()

    renderHook(() =>
      useLocalEvent({ event: 'my-event', active: false }, fn),
    )

    expect(client._channel.on).not.toHaveBeenCalled()
  })

  it('cleans up listener on unmount', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const fn = vi.fn()

    const { unmount } = renderHook(() => useLocalEvent('my-event', fn))

    expect(client._channel.on).toHaveBeenCalled()

    unmount()

    expect(client._channel.off).toHaveBeenCalledWith(
      'my-event',
      expect.any(Function),
    )
  })

  it('uses default active=true when not specified in object params', () => {
    const client = createMockClient()
    mockClientRef.current = client
    const fn = vi.fn()

    renderHook(() => useLocalEvent({ event: 'my-event' }, fn))

    expect(client._channel.on).toHaveBeenCalledWith(
      'my-event',
      expect.any(Function),
    )
  })
})

describe('useRemoteEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSubscribeParams = undefined
    capturedSubscribeCallback = undefined
    mockClientRef.current = createMockClient()
  })

  it('delegates to useSubscribe with correct params', () => {
    const fn = vi.fn()

    renderHook(() =>
      useRemoteEvent(
        { event: 'remote-event', channel: 'remote-channel', active: true },
        fn,
        ['dep1'],
      ),
    )

    expect(capturedSubscribeParams).toEqual({
      event: 'remote-event',
      channel: 'remote-channel',
      active: true,
    })
    expect(capturedSubscribeCallback).toBe(fn)
  })

  it('passes default channel NO_CHANNEL when not specified', () => {
    const fn = vi.fn()

    renderHook(() => useRemoteEvent({ event: 'remote-event' }, fn))

    expect(capturedSubscribeParams).toEqual({
      event: 'remote-event',
      channel: 'NO_CHANNEL',
      active: true,
    })
  })

  it('passes active=false when specified', () => {
    const fn = vi.fn()

    renderHook(() =>
      useRemoteEvent({ event: 'remote-event', active: false }, fn),
    )

    expect(capturedSubscribeParams).toEqual({
      event: 'remote-event',
      channel: 'NO_CHANNEL',
      active: false,
    })
  })
})
