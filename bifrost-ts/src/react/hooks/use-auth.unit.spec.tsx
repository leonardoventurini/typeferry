// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useAuth } from './use-auth'

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

vi.mock('./use-object', () => ({
  useObject: (obj: any) => obj,
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

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedThrottledCallback = undefined as any
    capturedThrottledEvents = undefined as any
  })

  it('returns initial authenticated and context from client', () => {
    const context = { userId: '123', role: 'admin' }
    mockClientRef.current = createMockClient({
      authenticated: true,
      context,
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.authenticated).toBe(true)
    expect(result.current.context).toEqual(context)
    expect(result.current.client).toBe(mockClientRef.current)
  })

  it('returns unauthenticated state when client is not authenticated', () => {
    mockClientRef.current = createMockClient({
      authenticated: false,
      context: {},
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.authenticated).toBe(false)
    expect(result.current.context).toEqual({})
  })

  it('registers throttled events for INITIALIZED, LOGOUT, CONTEXT_CHANGED', () => {
    mockClientRef.current = createMockClient()

    renderHook(() => useAuth())

    expect(capturedThrottledEvents).toEqual([
      'initialized',
      'auth:logout',
      'context:changed',
    ])
  })

  it('updates state when throttled callback fires after client state changes', () => {
    const client = createMockClient({
      authenticated: false,
      context: {},
    })
    mockClientRef.current = client

    const { result } = renderHook(() => useAuth())

    expect(result.current.authenticated).toBe(false)
    expect(result.current.context).toEqual({})

    // Simulate client state changing
    client.authenticated = true
    client.context = { userId: '456', token: 'abc' }

    act(() => {
      capturedThrottledCallback()
    })

    expect(result.current.authenticated).toBe(true)
    expect(result.current.context).toEqual({ userId: '456', token: 'abc' })
  })

  it('always returns the client reference', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { result } = renderHook(() => useAuth())

    expect(result.current.client).toBe(client)
  })
})
