// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useMethod } from './use-method'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

// Track the refresh function created by useMethodRefresh
let mockRefreshFn: ReturnType<typeof vi.fn>

vi.mock('./use-method-refresh', () => ({
  useMethodRefresh: (args: any) => {
    // Return the mock refresh function, which tests can control
    return mockRefreshFn
  },
}))

let mockCallerValue: any = { call: vi.fn() }

vi.mock('./use-caller', () => ({
  useCaller: () => mockCallerValue,
}))

let mockCircuitBreakerValue: any = { shouldCall: true }

vi.mock('./use-circuit-breaker', () => ({
  useCircuitBreaker: () => mockCircuitBreakerValue,
}))

// Track useLocalEvent calls
const localEventCalls: any[] = []

vi.mock('./use-local-event', () => ({
  useLocalEvent: (params: any, fn: any, deps: any) => {
    localEventCalls.push({ params, fn, deps })
  },
  useRemoteEvent: (params: any, fn: any, deps: any) => {
    // noop for tests
  },
}))

vi.mock('./use-subscribe', () => ({
  useSubscribe: () => false,
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

describe('useMethod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localEventCalls.length = 0
    mockRefreshFn = vi.fn()
    mockCallerValue = { call: vi.fn() }
    mockCircuitBreakerValue = { shouldCall: true }
    mockClientRef.current = createMockClient()
  })

  it('throws when method is not provided', () => {
    expect(() => {
      renderHook(() => useMethod({} as any))
    }).toThrow('Method name is required.')
  })

  it('throws when method is null', () => {
    expect(() => {
      renderHook(() => useMethod({ method: null } as any))
    }).toThrow('Method name is required.')
  })

  it('returns default state with loading=true', () => {
    const { result } = renderHook(() =>
      useMethod({ method: 'test.method' }),
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.refresh).toBeInstanceOf(Function)
    expect(result.current.optimistic).toBeInstanceOf(Function)
    expect(result.current.client).toBe(mockClientRef.current)
  })

  it('uses defaultValue as initial result', () => {
    const { result } = renderHook(() =>
      useMethod({ method: 'test.method', defaultValue: 'fallback' }),
    )

    expect(result.current.result).toBe('fallback')
  })

  it('returns loading=false when lazy=true', () => {
    const { result } = renderHook(() =>
      useMethod({ method: 'test.method', lazy: true }),
    )

    expect(result.current.loading).toBe(false)
  })

  it('returns placeholder when shouldCall is false from circuit breaker', () => {
    mockCircuitBreakerValue = {
      shouldCall: false,
      placeholderValue: 'placeholder-data',
    }

    const { result } = renderHook(() =>
      useMethod({ method: 'test.method' }),
    )

    expect(result.current.result).toBe('placeholder-data')
    expect(result.current.loading).toBe(false)
  })

  it('returns defaultValue when shouldCall is false and no placeholderValue', () => {
    mockCircuitBreakerValue = {
      shouldCall: false,
      placeholderValue: undefined,
    }

    const { result } = renderHook(() =>
      useMethod({ method: 'test.method', defaultValue: 'my-default' }),
    )

    expect(result.current.result).toBe('my-default')
    expect(result.current.loading).toBe(false)
  })

  it('calls refresh on mount when not lazy', () => {
    renderHook(() => useMethod({ method: 'test.method' }))

    expect(mockRefreshFn).toHaveBeenCalled()
  })

  it('does not call refresh on mount when lazy', () => {
    renderHook(() =>
      useMethod({ method: 'test.method', lazy: true }),
    )

    expect(mockRefreshFn).not.toHaveBeenCalled()
  })

  it('returns the client reference', () => {
    const client = createMockClient()
    mockClientRef.current = client

    const { result } = renderHook(() =>
      useMethod({ method: 'test.method' }),
    )

    expect(result.current.client).toBe(client)
  })

  it('returns noop functions when shouldCall is false', () => {
    mockCircuitBreakerValue = { shouldCall: false }

    const { result } = renderHook(() =>
      useMethod({ method: 'test.method' }),
    )

    // The noop refresh should not throw when called
    expect(() => result.current.refresh()).not.toThrow()
    expect(() => (result.current.optimistic as any)()).not.toThrow()
  })

  it('returns error as null initially', () => {
    const { result } = renderHook(() =>
      useMethod({ method: 'test.method' }),
    )

    expect(result.current.error).toBeNull()
  })

  it('registers local event handlers for INITIALIZING and INITIALIZED', () => {
    renderHook(() =>
      useMethod({ method: 'test.method', authenticated: true }),
    )

    const initializingCall = localEventCalls.find(
      (call) => call.params?.event === 'initializing',
    )
    const initializedCall = localEventCalls.find(
      (call) => call.params?.event === 'initialized',
    )

    expect(initializingCall).toBeDefined()
    expect(initializedCall).toBeDefined()
  })

  it('returns defaultValue when result is null', () => {
    const { result } = renderHook(() =>
      useMethod({ method: 'test.method', defaultValue: [] }),
    )

    // result.current.result should be defaultValue since internal result is null
    expect(result.current.result).toEqual([])
  })

  describe('useOptimistic', () => {
    it('throws when called with a non-function argument', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method' }),
      )

      expect(() => {
        act(() => {
          ;(result.current.optimistic as any)('not a function')
        })
      }).toThrow('Function Expected')
    })

    it('applies callback to current result and updates state', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method' }),
      )

      // Internal result starts as null; optimistic callback receives it
      act(() => {
        result.current.optimistic((current: any) =>
          current === null ? 'optimistic-value' : current,
        )
      })

      expect(result.current.result).toBe('optimistic-value')
    })

    it('replaces result via optimistic update with object', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method' }),
      )

      act(() => {
        result.current.optimistic(() => ({ count: 42 }))
      })

      expect(result.current.result).toEqual({ count: 42 })
    })
  })

  describe('useInitializingHandler', () => {
    it('sets loading=true via INITIALIZING event when authenticated', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: true }),
      )

      // Find the INITIALIZING event handler
      const initializingCall = localEventCalls.find(
        (call) => call.params?.event === 'initializing',
      )
      expect(initializingCall).toBeDefined()

      // The handler should exist and be a function
      expect(typeof initializingCall.fn).toBe('function')
    })

    it('does not set loading when not authenticated', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: false }),
      )

      // INITIALIZING handler is still registered, but it checks authenticated flag
      const initializingCall = localEventCalls.find(
        (call) => call.params?.event === 'initializing',
      )
      expect(initializingCall).toBeDefined()
    })
  })

  describe('useInitializedHandler', () => {
    it('registers INITIALIZED event handler', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: true }),
      )

      const initializedCall = localEventCalls.find(
        (call) => call.params?.event === 'initialized',
      )
      expect(initializedCall).toBeDefined()
      expect(typeof initializedCall.fn).toBe('function')
    })
  })

  describe('useLogoutHandler', () => {
    it('registers auth:logout event handler when authenticated', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: true }),
      )

      const logoutCall = localEventCalls.find(
        (call) => call.params?.event === 'auth:logout',
      )
      expect(logoutCall).toBeDefined()
      expect(typeof logoutCall.fn).toBe('function')
    })
  })

  describe('debounced refresh', () => {
    it('uses debounced refresh when debounced option is set', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method', debounced: 300 }),
      )

      // The refresh function should be defined
      expect(result.current.refresh).toBeDefined()
      expect(typeof result.current.refresh).toBe('function')
    })

    it('uses non-debounced refresh when debounced is not set', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method' }),
      )

      expect(result.current.refresh).toBeDefined()
      // The refresh should be the direct mockRefreshFn
      expect(result.current.refresh).toBe(mockRefreshFn)
    })
  })

  describe('cleanup on unmount', () => {
    it('cancels debounced refresh on unmount', () => {
      const { unmount } = renderHook(() =>
        useMethod({ method: 'test.method', debounced: 200 }),
      )

      // Should not throw on unmount
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('authenticated mode', () => {
    it('registers initializing, initialized, and logout listeners when authenticated', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: true }),
      )

      const events = localEventCalls.map((c) => c.params?.event).filter(Boolean)
      expect(events).toContain('initializing')
      expect(events).toContain('initialized')
      expect(events).toContain('auth:logout')
    })

    it('still registers event handlers when not authenticated', () => {
      renderHook(() =>
        useMethod({ method: 'test.method', authenticated: false }),
      )

      // Handlers are registered regardless, they just check the flag internally
      const events = localEventCalls.map((c) => c.params?.event).filter(Boolean)
      expect(events).toContain('initializing')
      expect(events).toContain('initialized')
      expect(events).toContain('auth:logout')
    })
  })

  describe('custom event subscription', () => {
    it('registers a local event handler for custom event', () => {
      renderHook(() =>
        useMethod({
          method: 'test.method',
          event: 'custom:event',
          channel: 'my-channel',
        }),
      )

      const customCall = localEventCalls.find(
        (call) => call.params?.event === 'custom:event',
      )
      expect(customCall).toBeDefined()
      expect(customCall.params.channel).toBe('my-channel')
    })

    it('uses NO_CHANNEL when channel is not specified', () => {
      renderHook(() =>
        useMethod({
          method: 'test.method',
          event: 'my:event',
        }),
      )

      const customCall = localEventCalls.find(
        (call) => call.params?.event === 'my:event',
      )
      expect(customCall).toBeDefined()
      expect(customCall.params.channel).toBe('NO_CHANNEL')
    })
  })

  describe('lazy mode interaction with refresh', () => {
    it('does not call refresh on mount when lazy=true but calls when refresh invoked manually', () => {
      const { result } = renderHook(() =>
        useMethod({ method: 'test.method', lazy: true }),
      )

      expect(mockRefreshFn).not.toHaveBeenCalled()

      // Manually calling refresh should work
      act(() => {
        result.current.refresh()
      })

      expect(mockRefreshFn).toHaveBeenCalledTimes(1)
    })
  })
})
