// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { TypeFerryEvents, ClientEvents, NO_CHANNEL } from '../utils'
import EventEmitter2 from '../utils/event-emitter'
import { TypeFerryAuthController } from './auth-controller'
import { TypeFerryConnectionController } from './connection-controller'
import { TypeFerryLocalEventController } from './local-event-controller'
import { TypeFerrySubscribeController } from './subscribe-controller'

function createChannel(name: string) {
  const channel = new EventEmitter2({ maxListeners: 512 }) as any
  channel.name = name
  channel.subscribe = vi.fn(async (event: string) => ({ [event]: true }))
  channel.unsubscribe = vi.fn(async () => undefined)
  return channel
}

function createClient(overrides: Record<string, any> = {}) {
  const channels = new Map<string, any>()
  const client = new EventEmitter2({ maxListeners: 512 }) as any

  client.subscribe = vi.fn(async (event: string) => ({ [event]: true }))
  client.unsubscribe = vi.fn(async () => undefined)
  client.call = vi.fn()
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

describe('Lit controllers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('tracks auth and connection state', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()

    const auth = new TypeFerryAuthController(host, client)
    const connection = new TypeFerryConnectionController(host, client)

    auth.hostConnected()
    connection.hostConnected()

    expect(auth.authenticated).toBe(false)
    expect(auth.context).toEqual({})
    expect(connection.isOffline).toBe(true)
    expect(connection.isOnline).toBe(false)

    client.authenticated = true
    client.context = { token: 'abc', userId: 'user-1' }
    client.isOffline = false
    client.isOnline = true
    client.isConnecting = false

    client.emit(ClientEvents.CONTEXT_CHANGED)
    client.emit(ClientEvents.CONNECTING)

    vi.advanceTimersByTime(16)
    await Promise.resolve()

    expect(auth.authenticated).toBe(true)
    expect(auth.context).toEqual({ token: 'abc', userId: 'user-1' })
    expect(connection.isOffline).toBe(false)
    expect(connection.isOnline).toBe(true)
    expect(connection.isConnecting).toBe(false)

    client.emit(ClientEvents.WEBSOCKET_RECONNECTING)
    expect(connection.isReconnecting).toBe(true)

    client.emit(ClientEvents.INITIALIZED)
    expect(connection.isReconnecting).toBe(false)
  })

  it('wires local event handlers to the requested channel', () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()
    const callback = vi.fn()
    const channel = client.channel('room-1')

    const controller = new TypeFerryLocalEventController(host, client, {
      event: 'ping',
      channel: 'room-1',
      callback,
    })

    controller.hostConnected()

    channel.emit('ping', 'hello')

    expect(callback).toHaveBeenCalledWith('hello')

    controller.hostDisconnected()
    channel.emit('ping', 'goodbye')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('subscribes to remote events and unsubscribes on disconnect', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()
    const callback = vi.fn()
    const channel = client.channel('room-2')

    const controller = new TypeFerrySubscribeController(host, client, {
      event: 'message',
      channel: 'room-2',
      callback,
    })

    controller.hostConnected()
    await Promise.resolve()

    expect(channel.subscribe).toHaveBeenCalledWith('message')
    expect(controller.ready).toBe(true)

    channel.emit('message', 'hello')
    expect(callback).toHaveBeenCalledWith('hello')

    controller.hostDisconnected()
    vi.advanceTimersByTime(1000)
    await Promise.resolve()

    expect(channel.unsubscribe).toHaveBeenCalledWith('message')
  })

  it('keeps subscription inactive when disabled', () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const client = createClient()
    const callback = vi.fn()
    const channel = client.channel('room-3')

    const controller = new TypeFerrySubscribeController(host, client, {
      event: 'message',
      channel: 'room-3',
      active: false,
      callback,
    })

    controller.hostConnected()

    expect(channel.subscribe).not.toHaveBeenCalled()
    expect(controller.ready).toBe(false)
  })

  it('rebinds controllers when the provided client changes', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const firstClient = createClient()
    const secondClient = createClient()
    const provider = { client: firstClient }
    const callback = vi.fn()

    const auth = new TypeFerryAuthController(host, provider)
    const localEvent = new TypeFerryLocalEventController(host, provider, {
      event: 'ping',
      channel: 'room-4',
      callback,
    })

    auth.hostConnected()
    localEvent.hostConnected()

    firstClient.authenticated = true
    firstClient.context = { token: 'first' }
    firstClient.emit(ClientEvents.CONTEXT_CHANGED)
    vi.advanceTimersByTime(16)
    await Promise.resolve()

    expect(auth.context).toEqual({ token: 'first' })

    const firstChannel = firstClient.channel('room-4')
    firstChannel.emit('ping', 'first')
    expect(callback).toHaveBeenCalledWith('first')

    provider.client = secondClient
    secondClient.authenticated = true
    secondClient.context = { token: 'second' }

    auth.hostUpdate()
    localEvent.hostUpdate()

    secondClient.emit(ClientEvents.CONTEXT_CHANGED)
    vi.advanceTimersByTime(16)
    await Promise.resolve()

    expect(auth.context).toEqual({ token: 'second' })

    const secondChannel = secondClient.channel('room-4')
    secondChannel.emit('ping', 'second')
    expect(callback).toHaveBeenCalledWith('second')

    firstClient.context = { token: 'stale' }
    firstClient.emit(ClientEvents.CONTEXT_CHANGED)
    firstChannel.emit('ping', 'stale')
    vi.advanceTimersByTime(16)
    await Promise.resolve()

    expect(auth.context).toEqual({ token: 'second' })
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('rebinds remote subscriptions when the provided client changes', async () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const firstClient = createClient()
    const secondClient = createClient()
    const provider = { client: firstClient }
    const callback = vi.fn()

    const controller = new TypeFerrySubscribeController(host, provider, {
      event: 'message',
      channel: 'room-5',
      callback,
    })

    controller.hostConnected()
    await Promise.resolve()

    const firstChannel = firstClient.channel('room-5')
    expect(firstChannel.subscribe).toHaveBeenCalledWith('message')

    provider.client = secondClient
    controller.hostUpdate()
    await Promise.resolve()

    const secondChannel = secondClient.channel('room-5')
    expect(secondChannel.subscribe).toHaveBeenCalledWith('message')

    secondChannel.emit('message', 'fresh')
    firstChannel.emit('message', 'stale')

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('fresh')
  })
})
