import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientEvents, MessageType, Presentation } from '../utils'
import { Client } from './client'
import { LogLevel } from './logger'

const HEARTBEAT_INTERVAL_MS = 30_000
const SERVER_MESSAGE_GRACE_MS = 30_000
const RPC_TIMEOUT_MS = 120_000
const CLOCK_GAP_MS = 60_001

class TrackedEventTarget extends EventTarget {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (callback) {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(callback)
      this.listeners.set(type, listeners)
    }

    super.addEventListener(type, callback, options)
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (callback) this.listeners.get(type)?.delete(callback)

    super.removeEventListener(type, callback, options)
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0)
  }
}

class BrowserDocument extends TrackedEventTarget {
  visibilityState: DocumentVisibilityState = 'visible'

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

/**
 * Keeps the browser's property handlers and additive listeners independent.
 * The runtime owns property handlers; recovery can observe the same messages
 * without replacing the transport's RPC/auth dispatch.
 */
class ControlledWebSocket extends TrackedEventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: ControlledWebSocket[] = []

  readyState: number = ControlledWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  sent: string[] = []

  constructor(readonly url: string) {
    super()

    ControlledWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = ControlledWebSocket.OPEN
    const event = new Event('open')

    this.onopen?.(event)
    this.dispatchEvent(event)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  receive(data: string): void {
    const event = new MessageEvent<string>('message', { data })

    this.onmessage?.(event)
    this.dispatchEvent(event)
  }

  close(): void {
    this.readyState = ControlledWebSocket.CLOSED
    const event = new Event('close')

    this.onclose?.(event)
    this.dispatchEvent(event)
  }

  fail(): void {
    const event = new Event('error')

    this.onerror?.(event)
    this.dispatchEvent(event)
  }
}

function activeSocket(): ControlledWebSocket {
  const socket = ControlledWebSocket.instances.at(-1)
  if (!socket) throw new Error('The fixture has no active socket')

  return socket
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error('The deferred promise was not constructed')
  }
  const promise = new Promise<void>(complete => {
    resolve = complete
  })

  return { promise, resolve }
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

async function authenticate(socket = activeSocket()): Promise<void> {
  socket.open()
  socket.receive(Presentation.encode({ t: MessageType.AUTH, authenticated: true }))

  await flush()
}

async function heartbeatGap(): Promise<void> {
  // Move wall time without firing intervals, then let one heartbeat observe
  // the gap. This models a paused main thread rather than 90 normal ticks.
  vi.setSystemTime(Date.now() + CLOCK_GAP_MS)

  await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
}

function pendingRpc(client: Client): {
  outcome: Promise<string>
  respond: () => void
} {
  const socket = activeSocket()
  const outcome = client.clientSocket.emitWithAck<string>(
    'rpc',
    { method: 'fixture.read' },
    RPC_TIMEOUT_MS,
  ).then(value => value, (error: unknown) => error instanceof Error ? error.message : String(error))
  const request = socket.sent.at(-1)
  if (!request) throw new Error('The RPC request was not sent')

  const envelope = Presentation.decode<{ id: string }>(request)

  return {
    outcome,
    respond: () => socket.receive(Presentation.encode({
      t: MessageType.RPC_RESPONSE,
      id: envelope.id,
      result: 'retained',
    })),
  }
}

describe('visibility recovery with the real client socket', () => {
  let browserDocument: BrowserDocument
  let client: Client
  let initializationListeners: number

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
    ControlledWebSocket.instances = []
    browserDocument = new BrowserDocument()

    vi.stubGlobal('document', browserDocument)
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('WebSocket', ControlledWebSocket)

    client = new Client({ host: 'fixture.invalid', logLevel: LogLevel.SILENT })

    await authenticate()
    expect(client.initialized).toBe(true)
    initializationListeners = client.listenerCount(ClientEvents.INITIALIZED)
  })

  afterEach(async () => {
    await client.close()
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('retains a healthy OPEN socket and its pending RPC when a valid message arrives during grace', async () => {
    const socket = activeSocket()
    const pending = pendingRpc(client)

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(client.initialized).toBe(true)

    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS - 1)
    socket.receive(Presentation.encode({ t: MessageType.PING }))
    pending.respond()

    await expect(pending.outcome).resolves.toBe('retained')
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(socket.listenerCount).toBe(0)
  })

  it('defers hidden heartbeat gaps until visible and then accepts a live server message', async () => {
    const socket = activeSocket()
    const hook = vi.fn(async () => undefined)
    client.visibilityManager.onBeforeReconnect = hook
    browserDocument.setVisibility('hidden')

    await heartbeatGap()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS * 2)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(hook).not.toHaveBeenCalled()

    browserDocument.setVisibility('visible')
    await flush()
    socket.receive(Presentation.encode({ t: MessageType.PING }))

    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(hook).toHaveBeenCalledTimes(1)
  })

  it('replaces a stale OPEN socket once after grace and settles its pending RPC', async () => {
    const pending = pendingRpc(client)
    const closed = vi.fn()
    client.on(ClientEvents.WEBSOCKET_CLOSED, closed)

    await heartbeatGap()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS - 1)
    expect(ControlledWebSocket.instances).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(closed).toHaveBeenCalledTimes(1)
    await expect(pending.outcome).resolves.toBe('Connection lost')
  })

  it('deduplicates signals through hook, probe, CONNECTING and authentication, then permits another recovery', async () => {
    const hook = deferred()
    client.visibilityManager.onBeforeReconnect = vi.fn(() => hook.promise)

    await heartbeatGap()
    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS - 1)

    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    hook.resolve()
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(1)

    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket().readyState).toBe(ControlledWebSocket.CONNECTING)

    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(2)

    activeSocket().open()
    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(2)

    await authenticate()
    await heartbeatGap()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(3)
  })

  it('replaces immediately when the auth hook refreshes the token', async () => {
    const pending = pendingRpc(client)
    client.visibilityManager.onBeforeReconnect = vi.fn(async () => {
      client.setContext({ token: 'refreshed-fixture-token' })
    })

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket().url).toContain('token=refreshed-fixture-token')
    await expect(pending.outcome).resolves.toBe('Connection lost')
  })

  it('rechecks token changes during the probe before trusting delivered traffic', async () => {
    const socket = activeSocket()
    const pending = pendingRpc(client)

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(1)
    client.setContext({ token: 'changed-during-probe' })
    socket.receive(Presentation.encode({ t: MessageType.PING }))
    await flush()

    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket().url).toContain('token=changed-during-probe')
    await expect(pending.outcome).resolves.toBe('Connection lost')
  })

  it('replaces after all three auth hook attempts fail instead of trusting stale traffic', async () => {
    const hook = vi.fn(async () => { throw new Error('The network is unavailable') })
    client.visibilityManager.onBeforeReconnect = hook

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(4_000)

    expect(hook).toHaveBeenCalledTimes(3)
    expect(ControlledWebSocket.instances).toHaveLength(2)
  })

  it('bounds three hanging hook attempts and ignores their eventual completion', async () => {
    const hung = deferred()
    const hook = vi.fn(() => hung.promise)
    client.visibilityManager.onBeforeReconnect = hook

    await heartbeatGap()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(ControlledWebSocket.instances).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(2_000 + SERVER_MESSAGE_GRACE_MS)
    expect(hook).toHaveBeenCalledTimes(2)
    expect(ControlledWebSocket.instances).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(2_000 + SERVER_MESSAGE_GRACE_MS)
    expect(hook).toHaveBeenCalledTimes(3)
    expect(ControlledWebSocket.instances).toHaveLength(2)

    hung.resolve()
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(2)
  })

  it('preserves a newer socket created while the auth hook is pending', async () => {
    const hook = deferred()
    client.visibilityManager.onBeforeReconnect = vi.fn(() => hook.promise)

    await heartbeatGap()
    client.clientSocket.retireConnection()
    client.clientSocket.connect()
    await authenticate()
    const successor = activeSocket()
    hook.resolve()
    await flush()

    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket()).toBe(successor)
    expect(client.initialized).toBe(true)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)
  })

  it('re-handshakes a successor opened with the old token while refresh was pending', async () => {
    const refresh = deferred()
    client.setContext({ token: 'old-fixture-token' })
    client.visibilityManager.onBeforeReconnect = vi.fn(async () => {
      await refresh.promise
      client.setContext({ token: 'fresh-fixture-token' })
    })

    await heartbeatGap()
    activeSocket().close()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket().url).toContain('token=old-fixture-token')
    await authenticate()
    const pending = pendingRpc(client)

    refresh.resolve()
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(3)
    expect(activeSocket().url).toContain('token=fresh-fixture-token')
    await expect(pending.outcome).resolves.toBe('Connection lost')

    await authenticate()
    expect(ControlledWebSocket.instances).toHaveLength(3)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)
  })

  it('joins a successor already opened with the refreshed token without another handshake', async () => {
    const refresh = deferred()
    client.setContext({ token: 'old-fixture-token' })
    client.visibilityManager.onBeforeReconnect = vi.fn(async () => {
      await refresh.promise
      client.setContext({ token: 'fresh-fixture-token' })
    })

    await heartbeatGap()
    client.setContext({ token: 'fresh-fixture-token' })
    activeSocket().close()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(activeSocket().url).toContain('token=fresh-fixture-token')
    const successor = activeSocket()

    refresh.resolve()
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners + 1)

    await authenticate()
    expect(activeSocket()).toBe(successor)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)
  })

  it('joins transport-owned automatic reconnect while the auth hook is pending', async () => {
    const hook = deferred()
    client.visibilityManager.onBeforeReconnect = vi.fn(() => hook.promise)

    await heartbeatGap()
    activeSocket().close()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ControlledWebSocket.instances).toHaveLength(2)

    hook.resolve()
    await flush()
    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    expect(ControlledWebSocket.instances).toHaveLength(2)

    await authenticate()
    expect(client.initialized).toBe(true)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)
  })

  it('keeps recovery ownership until a newer authenticated socket finishes resubscribing', async () => {
    const hook = deferred()
    const subscriptions = deferred()
    const beforeReconnect = vi.fn(() => hook.promise)
    client.visibilityManager.onBeforeReconnect = beforeReconnect

    await heartbeatGap()
    client.clientSocket.retireConnection()
    client.clientSocket.connect()
    vi.spyOn(client, 'resubscribeAllChannels').mockImplementation(() => subscriptions.promise)
    await authenticate()
    expect(client.initialized).toBe(true)

    hook.resolve()
    await flush()
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners + 1)

    // Wall time changes without advancing the initialization deadline. A
    // second wake signal must join the unfinished subscription lifecycle.
    browserDocument.setVisibility('hidden')
    vi.setSystemTime(Date.now() + 60 * 60 * 1_000 + 1)
    browserDocument.setVisibility('visible')
    await flush()
    expect(beforeReconnect).toHaveBeenCalledTimes(1)
    expect(ControlledWebSocket.instances).toHaveLength(2)

    subscriptions.resolve()
    await flush()
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)

    await heartbeatGap()
    expect(beforeReconnect).toHaveBeenCalledTimes(2)
    activeSocket().receive(Presentation.encode({ t: MessageType.PING }))
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(2)
  })

  it('releases the recovery guard if its replacement never initializes', async () => {
    const hook = vi.fn(async () => undefined)
    client.visibilityManager.onBeforeReconnect = hook

    await heartbeatGap()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners + 1)

    activeSocket().open()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(client.initialized).toBe(false)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)

    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await flush()
    expect(hook).toHaveBeenCalledTimes(2)
    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners + 1)

    await authenticate()
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(initializationListeners)
  })

  it('checks traffic after a long hidden interval instead of immediately replacing a healthy socket', async () => {
    const socket = activeSocket()
    const pending = pendingRpc(client)
    browserDocument.setVisibility('hidden')
    vi.setSystemTime(Date.now() + 60 * 60 * 1_000 + 1)
    browserDocument.setVisibility('visible')
    await flush()
    expect(ControlledWebSocket.instances).toHaveLength(1)

    socket.receive(Presentation.encode({ t: MessageType.PING }))
    pending.respond()

    await expect(pending.outcome).resolves.toBe('retained')
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(1)
  })

  it.each([
    { name: 'malformed JSON', frame: 'not-json' },
    { name: 'an unknown protocol frame', frame: Presentation.encode({ t: 'fixture:unknown' }) },
  ])('ignores $name while waiting for valid server traffic', async ({ frame }) => {
    const socket = activeSocket()

    await heartbeatGap()
    socket.receive(frame)
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)

    expect(ControlledWebSocket.instances).toHaveLength(2)
    expect(socket.listenerCount).toBe(0)
  })

  it.each(['close', 'error'] as const)('skips the remaining grace when the socket reports %s', async signal => {
    const socket = activeSocket()

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(1)

    if (signal === 'close') socket.close()
    else socket.fail()

    await flush()
    expect(socket.listenerCount).toBe(0)
    // A close already starts the transport's bounded backoff; recovery joins
    // it rather than opening a competing socket. Errors replace immediately.
    if (signal === 'close') await vi.advanceTimersByTimeAsync(1_000)

    expect(ControlledWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS)
    expect(ControlledWebSocket.instances).toHaveLength(2)
  })

  it.each(['destroy', 'close'] as const)('cancels a pending hook on %s', async action => {
    const hook = deferred()
    client.visibilityManager.onBeforeReconnect = vi.fn(() => hook.promise)
    activeSocket().readyState = ControlledWebSocket.CLOSED
    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await flush()
    expect(client.visibilityManager.onBeforeReconnect).toHaveBeenCalledTimes(1)

    if (action === 'destroy') client.visibilityManager.destroy()
    else await client.close()

    hook.resolve()
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS * 2)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(browserDocument.listenerCount).toBe(0)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['destroy', 'close'] as const)('releases timers immediately on %s even when the hook never settles', async action => {
    const hung = deferred()
    const hook = vi.fn(() => hung.promise)
    client.visibilityManager.onBeforeReconnect = hook

    await heartbeatGap()
    expect(hook).toHaveBeenCalledTimes(1)

    if (action === 'destroy') client.visibilityManager.destroy()
    else await client.close()

    await flush()
    expect(vi.getTimerCount()).toBe(0)
    expect(browserDocument.listenerCount).toBe(0)
    expect(client.listenerCount(ClientEvents.INITIALIZED)).toBe(0)

    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS * 4)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(ControlledWebSocket.instances).toHaveLength(1)
  })

  it.each(['destroy', 'close'] as const)('cancels hook retry backoff on %s', async action => {
    const hook = vi.fn(async () => { throw new Error('The network is unavailable') })
    client.visibilityManager.onBeforeReconnect = hook
    activeSocket().readyState = ControlledWebSocket.CLOSED
    browserDocument.setVisibility('hidden')
    browserDocument.setVisibility('visible')
    await flush()
    expect(hook).toHaveBeenCalledTimes(1)

    if (action === 'destroy') client.visibilityManager.destroy()
    else await client.close()

    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS * 2)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(browserDocument.listenerCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['destroy', 'close'] as const)('cancels the passive probe on %s and removes its listeners', async action => {
    const socket = activeSocket()

    await heartbeatGap()
    expect(ControlledWebSocket.instances).toHaveLength(1)

    if (action === 'destroy') client.visibilityManager.destroy()
    else await client.close()

    socket.receive(Presentation.encode({ t: MessageType.PING }))
    await vi.advanceTimersByTimeAsync(SERVER_MESSAGE_GRACE_MS * 2)
    expect(ControlledWebSocket.instances).toHaveLength(1)
    expect(socket.listenerCount).toBe(0)
    expect(browserDocument.listenerCount).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
