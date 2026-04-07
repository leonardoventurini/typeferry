import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshAccessToken, setupTokenRefreshOnExpiry } from './token-refresh'

class BroadcastChannelMock {
  static instances: BroadcastChannelMock[] = []

  public name: string
  public messages: any[] = []
  private listeners = new Map<string, Set<(event: any) => void>>()

  constructor(name: string) {
    this.name = name
    BroadcastChannelMock.instances.push(this)
  }

  postMessage(message: any) {
    this.messages.push(message)

    const handlers = this.listeners.get('message')
    if (!handlers) return

    for (const handler of handlers) {
      handler({ data: message })
    }
  }

  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  close() {}
}

class MockClient {
  context: any = {}
  call = vi.fn()
  updateContext = vi.fn()
  clearContext = vi.fn()
  logger = { auth: vi.fn() }

  private handlers = new Map<string, Set<() => void>>()

  on = vi.fn((event: string, handler: () => void) => {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  })

  off = vi.fn((event: string, handler: () => void) => {
    this.handlers.get(event)?.delete(handler)
  })

  emit(event: string) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler()
    }
  }
}

describe('bifrost token refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as any).BroadcastChannel = BroadcastChannelMock
    BroadcastChannelMock.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (globalThis as any).BroadcastChannel
  })

  it('refreshAccessToken updates context and broadcasts token', async () => {
    const client = new MockClient()
    const iat = Math.floor(Date.now() / 1000)
    client.call.mockResolvedValue({
      accessToken: 'new-token',
      exp: 1234567890,
      iat,
    })

    const token = await refreshAccessToken(client as any, {
      refreshMethod: 'auth.refresh',
      broadcastChannelName: 'test-channel',
    })

    expect(client.call).toHaveBeenCalledWith(
      'auth.refresh',
      {},
      { ignoreInit: true, http: true },
    )
    expect(client.updateContext).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'new-token',
        exp: 1234567890,
        iat,
      }),
    )
    // _tokenReceivedAt is also set (timestamp)
    const ctxArg = client.updateContext.mock.calls[0][0]
    expect(ctxArg._tokenReceivedAt).toBeTypeOf('number')

    expect(token).toBe('new-token')

    expect(BroadcastChannelMock.instances.length).toBeGreaterThan(0)
    const channel = BroadcastChannelMock.instances.find(
      c => c.name === 'test-channel',
    )
    expect(channel?.messages).toContainEqual({
      type: 'TOKEN_REFRESHED',
      token: 'new-token',
      exp: 1234567890,
      iat,
    })
  })

  it('refreshAccessToken queues concurrent refresh calls per client', async () => {
    const client = new MockClient()

    let resolveCall: (value: any) => void
    client.call.mockImplementation(
      () =>
        new Promise(res => {
          resolveCall = res
        }),
    )

    const p1 = refreshAccessToken(client as any)
    const p2 = refreshAccessToken(client as any)

    expect(client.call).toHaveBeenCalledTimes(1)

    resolveCall!({ accessToken: 'new-token', exp: 1 })

    await expect(p1).resolves.toBe('new-token')
    await expect(p2).resolves.toBe('new-token')
  })

  it('setupTokenRefreshOnExpiry schedules refresh before exp (legacy fallback)', async () => {
    const client = new MockClient()

    const nowSec = 1_000_000_000
    vi.setSystemTime(nowSec * 1000)

    // No iat/_tokenReceivedAt → uses legacy exp-based calculation
    client.context = { exp: nowSec + 300 } // 5 minutes
    client.call.mockResolvedValue({
      accessToken: 'new-token',
      exp: nowSec + 600,
      iat: nowSec,
    })

    setupTokenRefreshOnExpiry(client as any, {
      refreshBeforeExpirySec: 60,
      refreshMethod: 'auth.refresh',
    })

    vi.advanceTimersByTime(240_000)

    expect(client.call).toHaveBeenCalledWith(
      'auth.refresh',
      {},
      { ignoreInit: true, http: true },
    )
  })

  it('setupTokenRefreshOnExpiry uses clock-skew-safe scheduling with iat', async () => {
    const client = new MockClient()

    const nowSec = 1_000_000_000
    vi.setSystemTime(nowSec * 1000)

    // Simulate client clock 4 hours ahead of server:
    // Server iat = nowSec - 14400, server exp = iat + 900 (15min)
    // Without clock-skew fix, exp - clientNow = (iat + 900) - nowSec = -13500 → immediate refresh loop
    // With fix: TTL = 900s, elapsed = Date.now() - _tokenReceivedAt = 0 → schedules at 840s
    const serverIat = nowSec - 14400
    const serverExp = serverIat + 900

    client.context = {
      exp: serverExp,
      iat: serverIat,
      _tokenReceivedAt: nowSec * 1000, // received "just now" in client time
    }
    client.call.mockResolvedValue({
      accessToken: 'new-token',
      exp: serverExp + 900,
      iat: serverIat + 900,
    })

    type RefreshClient = Parameters<typeof setupTokenRefreshOnExpiry>[0]

    setupTokenRefreshOnExpiry(client as unknown as RefreshClient, {
      refreshBeforeExpirySec: 60,
      refreshMethod: 'auth.refresh',
    })

    // Should NOT refresh immediately despite exp being in the past from client's POV
    expect(client.call).not.toHaveBeenCalled()

    // TTL = 900s, refreshBefore = 60s → should fire at 840s
    vi.advanceTimersByTime(839_000)
    expect(client.call).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1_000) // 840s total
    expect(client.call).toHaveBeenCalledTimes(1)
  })

  it('scheduleRefresh defers when refresh is already in progress', () => {
    const client = new MockClient()

    const nowSec = 1_000_000_000
    vi.setSystemTime(nowSec * 1000)

    // Token already expired — scheduleRefresh would normally refresh immediately
    client.context = { exp: nowSec - 10 }

    let resolveCall: (value: { accessToken: string; exp: number }) => void
    client.call.mockImplementation(
      () =>
        new Promise<{ accessToken: string; exp: number }>(res => {
          resolveCall = res
        }),
    )

    type RefreshClient = Parameters<typeof setupTokenRefreshOnExpiry>[0]

    const cleanup = setupTokenRefreshOnExpiry(
      client as unknown as RefreshClient,
      {
        refreshBeforeExpirySec: 60,
        refreshMethod: 'auth.refresh',
      },
    )

    // Initial scheduleRefresh fires immediate refresh (timeUntilExpiry <= 0)
    expect(client.call).toHaveBeenCalledTimes(1)

    // Simulate CONTEXT_CHANGED while refresh is in progress
    // (this is what happens when refreshAccessToken calls updateContext)
    client.emit('context:changed')

    // Should NOT start another refresh — should defer instead
    expect(client.call).toHaveBeenCalledTimes(1)

    // After 1 second, the deferred scheduleRefresh should retry
    vi.advanceTimersByTime(1000)

    // Still only 1 call because the original refresh is still in-progress
    // (isRefreshing is still true), so it defers again
    expect(client.call).toHaveBeenCalledTimes(1)

    // Resolve the original refresh — resolveCall is guaranteed assigned after
    // setupTokenRefreshOnExpiry fires the initial call above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    resolveCall!({ accessToken: 'new-token', exp: nowSec + 900 })

    cleanup()
  })
})
