// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { BifrostEvents, NO_CHANNEL } from '../utils'
import EventEmitter2 from '../utils/event-emitter'
import { BifrostMethodController } from './method-controller'

function createChannel(name: string) {
  const channel = new EventEmitter2({ maxListeners: 512 }) as any
  channel.name = name
  channel.subscribe = vi.fn(async (event: string) => ({ [event]: true }))
  channel.unsubscribe = vi.fn(async () => undefined)
  return channel
}

function createClient(
  overrides: Record<string, any> = {},
  callImplementation: (...args: any[]) => Promise<any> = async (method, params) => ({
    method,
    params,
    ok: true,
  }),
) {
  const channels = new Map<string, any>()
  const client = new EventEmitter2({ maxListeners: 512 }) as any

  client.subscribe = vi.fn(async (event: string) => ({ [event]: true }))
  client.unsubscribe = vi.fn(async () => undefined)
  client.call = vi.fn(callImplementation)
  client.authenticated = false
  client.context = {}
  client.isOffline = true
  client.isOnline = false
  client.isConnecting = false
  client.visibilityManager = { onBeforeReconnect: null }
  client.channel = vi.fn((name: string = NO_CHANNEL) => {
    if (!name || name === NO_CHANNEL) return client

    if (!channels.has(name)) {
      channels.set(name, createChannel(name))
    }

    return channels.get(name)
  })

  Object.assign(client, overrides)
  return client
}

describe('BifrostMethodController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('refreshes on mount and reacts to local and remote refresh events', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()

    const controller = new BifrostMethodController(host, client, {
      method: 'user.get',
      params: { id: 123 },
      channel: 'room-1',
      event: 'local-refresh',
      defaultValue: 'fallback',
    })

    controller.hostConnected()
    await Promise.resolve()
    await Promise.resolve()

    expect(client.call).toHaveBeenCalledTimes(1)
    expect(controller.result).toEqual({
      method: 'user.get',
      params: { id: 123 },
      ok: true,
    })

    const channel = client.channel('room-1')
    channel.emit('local-refresh')
    await Promise.resolve()
    await Promise.resolve()

    expect(client.call).toHaveBeenCalledTimes(2)

    channel.emit(BifrostEvents.METHOD_REFRESH, 'user.get')
    await Promise.resolve()
    await Promise.resolve()

    expect(client.call).toHaveBeenCalledTimes(3)
  })

  it('skips calling when the authenticated guard fails', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient({ authenticated: false })

    const controller = new BifrostMethodController(host, client, {
      method: 'user.get',
      authenticated: true,
      defaultValue: 'fallback',
    })

    controller.hostConnected()
    await Promise.resolve()
    await Promise.resolve()

    expect(client.call).not.toHaveBeenCalled()
    expect(controller.result).toBe('fallback')
    expect(controller.loading).toBe(false)
  })

  it('debounces explicit refresh calls', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()

    const controller = new BifrostMethodController(host, client, {
      method: 'user.get',
      lazy: true,
      debounced: 50,
    })

    controller.hostConnected()

    expect(client.call).not.toHaveBeenCalled()

    controller.refresh()
    controller.refresh()

    vi.advanceTimersByTime(49)
    await Promise.resolve()
    expect(client.call).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(client.call).toHaveBeenCalledTimes(1)
  })
})
