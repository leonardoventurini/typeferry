// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useTokenRefresh } from './use-token-refresh'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

let mockAuthenticated = false

vi.mock('./use-auth', () => ({
  useAuth: () => ({ authenticated: mockAuthenticated }),
}))

const mockSetupTokenRefreshOnExpiry = vi.fn()
const mockRefreshAccessToken = vi.fn()

vi.mock('../../auth/client/token-refresh', () => ({
  setupTokenRefreshOnExpiry: (...args: any[]) =>
    mockSetupTokenRefreshOnExpiry(...args),
  refreshAccessToken: (...args: any[]) => mockRefreshAccessToken(...args),
}))

const mockIsTokenExpired = vi.fn()

vi.mock('../../client/context-manager', () => ({
  isTokenExpired: (...args: any[]) => mockIsTokenExpired(...args),
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

describe('useTokenRefresh', () => {
  let mockCleanupExpiry: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated = false
    mockCleanupExpiry = vi.fn()
    mockSetupTokenRefreshOnExpiry.mockReturnValue(mockCleanupExpiry)
    mockRefreshAccessToken.mockResolvedValue(undefined)
  })

  it('does nothing when not authenticated', () => {
    mockAuthenticated = false
    mockClientRef.current = createMockClient()

    renderHook(() => useTokenRefresh())

    expect(mockSetupTokenRefreshOnExpiry).not.toHaveBeenCalled()
    expect(mockClientRef.current.visibilityManager.onBeforeReconnect).toBeNull()
  })

  it('calls setupTokenRefreshOnExpiry when authenticated', () => {
    mockAuthenticated = true
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() => useTokenRefresh())

    expect(mockSetupTokenRefreshOnExpiry).toHaveBeenCalledWith(
      client,
      undefined,
    )
  })

  it('calls setupTokenRefreshOnExpiry with config when provided', () => {
    mockAuthenticated = true
    const client = createMockClient()
    mockClientRef.current = client
    const config = { refreshMethod: 'custom.refresh', refreshBeforeExpirySec: 30 }

    renderHook(() => useTokenRefresh(config))

    expect(mockSetupTokenRefreshOnExpiry).toHaveBeenCalledWith(
      client,
      config,
    )
  })

  it('sets onBeforeReconnect handler when authenticated', () => {
    mockAuthenticated = true
    const client = createMockClient()
    mockClientRef.current = client

    renderHook(() => useTokenRefresh())

    expect(client.visibilityManager.onBeforeReconnect).toBeInstanceOf(Function)
  })

  it('cleanup calls cleanupExpiry and resets onBeforeReconnect', () => {
    mockAuthenticated = true
    const client = createMockClient()
    mockClientRef.current = client

    const { unmount } = renderHook(() => useTokenRefresh())

    expect(client.visibilityManager.onBeforeReconnect).toBeInstanceOf(Function)
    expect(mockCleanupExpiry).not.toHaveBeenCalled()

    unmount()

    expect(mockCleanupExpiry).toHaveBeenCalled()
    expect(client.visibilityManager.onBeforeReconnect).toBeNull()
  })

  it('onBeforeReconnect calls refreshAccessToken when token is expired', async () => {
    mockAuthenticated = true
    const client = createMockClient({ context: { token: 'abc', exp: 100 } })
    mockClientRef.current = client
    mockIsTokenExpired.mockReturnValue(true)

    renderHook(() => useTokenRefresh())

    const onBeforeReconnect = client.visibilityManager.onBeforeReconnect
    expect(onBeforeReconnect).toBeInstanceOf(Function)

    await onBeforeReconnect()

    expect(mockIsTokenExpired).toHaveBeenCalledWith(client.context)
    expect(mockRefreshAccessToken).toHaveBeenCalledWith(client, undefined)
  })

  it('onBeforeReconnect skips refresh when token is not expired', async () => {
    mockAuthenticated = true
    const client = createMockClient({ context: { token: 'abc', exp: 999999 } })
    mockClientRef.current = client
    mockIsTokenExpired.mockReturnValue(false)

    renderHook(() => useTokenRefresh())

    const onBeforeReconnect = client.visibilityManager.onBeforeReconnect
    await onBeforeReconnect()

    expect(mockIsTokenExpired).toHaveBeenCalledWith(client.context)
    expect(mockRefreshAccessToken).not.toHaveBeenCalled()
  })

  it('does not set onBeforeReconnect when transitioning from authenticated to unauthenticated', () => {
    mockAuthenticated = true
    const client = createMockClient()
    mockClientRef.current = client

    const { rerender } = renderHook(() => useTokenRefresh())

    expect(client.visibilityManager.onBeforeReconnect).toBeInstanceOf(Function)

    // Simulate logout
    mockAuthenticated = false
    rerender()

    // Cleanup from the previous effect should have reset it
    expect(client.visibilityManager.onBeforeReconnect).toBeNull()
  })
})
