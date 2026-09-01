// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ClientEvents, NO_CHANNEL } from '../utils'
import EventEmitter2 from '../utils/event-emitter'

vi.mock('../auth/client/token-refresh', () => ({
  refreshAccessToken: vi.fn().mockResolvedValue(null),
  setupTokenRefreshOnExpiry: vi.fn(() => vi.fn()),
}))

vi.mock('../client/context-manager', () => ({
  isTokenExpired: vi.fn(() => true),
}))

import {
  refreshAccessToken,
  setupTokenRefreshOnExpiry,
} from '../auth/client/token-refresh'
import { TypeFerryTokenRefreshController } from './token-refresh-controller'

function createClient(overrides: Record<string, any> = {}) {
  const client = new EventEmitter2({ maxListeners: 512 }) as any
  client.call = vi.fn()
  client.channel = vi.fn((name: string = NO_CHANNEL) => client)
  client.authenticated = false
  client.context = {}
  client.visibilityManager = { onBeforeReconnect: null }

  Object.assign(client, overrides)
  return client
}

describe('TypeFerryTokenRefreshController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('starts token refresh only after authentication and clears on disconnect', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()

    const controller = new TypeFerryTokenRefreshController(host, client, {
      refreshMethod: 'auth.refresh',
      broadcastChannelName: 'sync-channel',
    })

    controller.hostConnected()
    expect(setupTokenRefreshOnExpiry).not.toHaveBeenCalled()
    expect(client.visibilityManager.onBeforeReconnect).toBeNull()

    client.authenticated = true
    client.emit(ClientEvents.INITIALIZED)
    vi.advanceTimersByTime(16)
    await Promise.resolve()

    expect(setupTokenRefreshOnExpiry).toHaveBeenCalledTimes(1)
    expect(client.visibilityManager.onBeforeReconnect).toBeInstanceOf(Function)

    await client.visibilityManager.onBeforeReconnect()
    expect(refreshAccessToken).toHaveBeenCalledWith(client, {
      refreshMethod: 'auth.refresh',
      broadcastChannelName: 'sync-channel',
    })

    controller.hostDisconnected()

    expect(client.visibilityManager.onBeforeReconnect).toBeNull()
  })

  it('moves reconnect hooks when the client source changes', () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const firstClient = createClient({ authenticated: true })
    const secondClient = createClient({ authenticated: true })
    const provider = { client: firstClient }

    const controller = new TypeFerryTokenRefreshController(host, provider, {
      refreshMethod: 'auth.refresh',
    })

    controller.hostConnected()

    expect(firstClient.visibilityManager.onBeforeReconnect).toBeInstanceOf(
      Function,
    )

    provider.client = secondClient
    controller.hostUpdate()

    expect(firstClient.visibilityManager.onBeforeReconnect).toBeNull()
    expect(secondClient.visibilityManager.onBeforeReconnect).toBeInstanceOf(
      Function,
    )
  })
})
