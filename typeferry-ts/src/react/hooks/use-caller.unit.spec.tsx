// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCaller } from './use-caller'

const createMockClient = () => ({
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
  call: vi.fn().mockResolvedValue('result'),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  close: vi.fn(),
  visibilityManager: { onBeforeReconnect: null },
  updateContext: vi.fn(),
  clearContext: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
})

describe('useCaller', () => {
  it('returns client.call directly when cache is false', () => {
    const client = createMockClient()

    const { result } = renderHook(() =>
      useCaller({ client, cache: false, maxAge: 5000 }),
    )

    expect(result.current).toBe(client.call)
  })

  it('returns a memoized function when cache is true', () => {
    const client = createMockClient()

    const { result } = renderHook(() =>
      useCaller({ client, cache: true, maxAge: 5000 }),
    )

    // The memoized wrapper is not the same reference as client.call
    expect(result.current).not.toBe(client.call)
    expect(typeof result.current).toBe('function')
  })

  it('memoized caller caches repeated calls with same args', async () => {
    const client = createMockClient()
    client.call.mockResolvedValue('cached-result')

    const { result } = renderHook(() =>
      useCaller({ client, cache: true, maxAge: 60000 }),
    )

    const first = await result.current('method', { id: 1 })
    const second = await result.current('method', { id: 1 })

    expect(first).toBe('cached-result')
    expect(second).toBe('cached-result')
    // client.call should only be invoked once due to memoization
    expect(client.call).toHaveBeenCalledTimes(1)
  })
})
