import { ClientEvents, MessageType, Presentation, WebSocketState } from '../utils'
import type { Client } from './client'
import type { IdleTimer } from './idle-timer'
import { LogLevel } from './logger'

/**
 * Time threshold below which we trust the socket connection is healthy.
 * Longer hides check delivered traffic before trusting an open socket.
 */
const FORCE_RECONNECT_THRESHOLD = 60 * 60 * 1000 // 1 hour

/** Heartbeat fires every 30s to detect OS sleep gaps. */
const HEARTBEAT_INTERVAL_MS = 30_000

/** A timer gap is wake evidence; background throttling can also cause it. */
const HEARTBEAT_THRESHOLD_MS = 60_000

/** The existing server heartbeat sends traffic every 25 seconds. */
const RECOVERY_TIMEOUT_MS = 30_000

/**
 * Only delivered server envelopes satisfy the grace. This is activity evidence,
 * not a new round-trip protocol or a replacement for ordinary RPC timeouts.
 */
function isServerTraffic(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('t' in value)) return false

  switch (value.t) {
    case MessageType.PING:
      return true
    case MessageType.AUTH:
      return 'authenticated' in value && typeof value.authenticated === 'boolean'
    case MessageType.RPC_RESPONSE:
      return 'id' in value && typeof value.id === 'string'
    case MessageType.EVENT:
      return 'event' in value && typeof value.event === 'string' &&
        'channel' in value && typeof value.channel === 'string'
    default:
      return false
  }
}

/**
 * Owns one bounded recovery wait and releases every timer/listener when it
 * settles. Abort also settles the promise so close cannot strand async work.
 */
function waitForRecovery(
  signal: AbortSignal,
  timeoutMs: number,
  subscribe?: (settle: (success: boolean) => void) => (() => void) | void,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)

  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | void
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      unsubscribe?.()
      unsubscribe = undefined
    }
    const finish = (success: boolean): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(success)
    }
    const onAbort = (): void => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)

    signal.addEventListener('abort', onAbort, { once: true })
    try {
      unsubscribe = subscribe?.(finish)
      // A subscriber can settle synchronously before returning its cleanup.
      if (settled) cleanup()
    } catch (error) {
      settled = true
      cleanup()
      reject(error)
    }
  })
}

/** Max retry attempts for the pre-reconnect hook (network may not be ready on wake). */
const HOOK_RETRY_ATTEMPTS = 3

/** Delay between hook retry attempts in ms. */
const HOOK_RETRY_DELAY_MS = 2_000

/**
 * Handles tab visibility changes and reconnects after browser/OS sleep.
 * Always instantiated — visibility recovery is always active regardless
 * of whether idle timeout is configured.
 *
 * Uses both `visibilitychange` events and a setInterval heartbeat to
 * detect sleep. macOS may not fire `visibilitychange` before idle-triggered
 * sleep, so the heartbeat catches gaps the event misses.
 */
export class VisibilityManager {
  /**
   * Optional async hook called before reconnecting after tab visibility restore.
   * Used by the auth system to proactively refresh expired access tokens so the
   * socket reconnects with a valid token instead of failing auth first.
   */
  onBeforeReconnect: (() => Promise<void>) | null = null

  private visibilityHandler: (() => void) | null = null
  private hiddenAt: number | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastHeartbeat: number = Date.now()

  /**
   * Guards against duplicate reconnects when both the heartbeat and
   * visibilitychange fire in quick succession after wake.
   */
  private recovery: AbortController | null = null
  private missedHeartbeat = false
  private destroyed = false
  private initializedSocket: WebSocket | undefined
  private readonly rememberInitialization = (): void => {
    this.initializedSocket = this.client.clientSocket.socket
  }

  constructor(
    private client: Client,
    private idleTimer: IdleTimer | null,
  ) {
    this.initializedSocket = client.initialized ? client.clientSocket.socket : undefined
    this.client.on(ClientEvents.INITIALIZED, this.rememberInitialization)
    this.setup()
  }

  /**
   * Explicit recovery replaces the socket immediately. Automatic wake recovery
   * first checks for traffic so timer throttling does not cancel live requests.
   */
  reconnect(): void {
    // Explicit reconnect remains usable after close; cancelled automatic work
    // still cannot restart the client or reattach browser recovery listeners.
    this.recovery?.abort()
    const recovery = new AbortController()
    this.recovery = recovery
    this.finishRecovery(recovery, this.replaceConnection(recovery))
  }

  /** Removes listeners, timers and pending recovery work. */
  destroy(): void {
    this.destroyed = true
    this.client.off(ClientEvents.INITIALIZED, this.rememberInitialization)
    this.recovery?.abort()
    this.recovery = null
    this.missedHeartbeat = false

    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    this.visibilityHandler = null
    this.stopHeartbeat()
  }

  private finishRecovery(
    recovery: AbortController,
    operation: Promise<unknown>,
  ): void {
    void operation.catch(error => {
      if (!recovery.signal.aborted) {
        this.client.logger.connection(
          LogLevel.WARN,
          'Wake recovery failed',
          {},
          error,
        )
      }
    }).finally(() => {
      recovery.abort()
      if (this.recovery === recovery) this.recovery = null
    })
  }

  private waitForInitialization(signal: AbortSignal): Promise<boolean> {
    return waitForRecovery(signal, RECOVERY_TIMEOUT_MS, finish => {
      const initialized = (): void => finish(true)
      const failed = (): void => finish(false)

      this.client.on(ClientEvents.INITIALIZED, initialized)
      this.client.on(ClientEvents.INITIALIZATION_FAILED, failed)

      return () => {
        this.client.off(ClientEvents.INITIALIZED, initialized)
        this.client.off(ClientEvents.INITIALIZATION_FAILED, failed)
      }
    })
  }

  private async replaceConnection(recovery: AbortController): Promise<boolean> {
    const wasInitialized = this.client.initialized
    // Subscribe before replacing: even synchronous initialization is observable.
    const initialized = this.waitForInitialization(recovery.signal)

    this.client.initialized = false
    this.client.initializing = false
    this.client.clientSocket.retireConnection()
    if (recovery.signal.aborted) return initialized

    this.client.clientSocket.connect()
    this.lastHeartbeat = Date.now()

    if (wasInitialized) {
      this.client.emit(ClientEvents.WEBSOCKET_RECONNECTING)
    }
    return initialized
  }

  private waitForTraffic(
    socket: WebSocket,
    signal: AbortSignal,
  ): Promise<boolean> {
    return waitForRecovery(signal, RECOVERY_TIMEOUT_MS, finish => {
      const token = this.client.context.token
      const contextChanged = (): void => {
        if (token !== this.client.context.token) finish(false)
      }
      const message = (event: MessageEvent<unknown>): void => {
        if (typeof event.data !== 'string') return
        try {
          const envelope = Presentation.decode<unknown>(event.data)
          if (isServerTraffic(envelope)) finish(true)
        } catch {
          // Malformed frames are not evidence of a working TypeFerry peer.
        }
      }
      const closed = (): void => finish(false)

      this.client.on(ClientEvents.CONTEXT_CHANGED, contextChanged)
      socket.addEventListener('message', message)
      socket.addEventListener('close', closed)
      socket.addEventListener('error', closed)

      return () => {
        this.client.off(ClientEvents.CONTEXT_CHANGED, contextChanged)
        socket.removeEventListener('message', message)
        socket.removeEventListener('close', closed)
        socket.removeEventListener('error', closed)
      }
    })
  }

  private setup(): void {
    if (typeof window === 'undefined') return

    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now()
        this.handlePageHide()
      } else if (document.visibilityState === 'visible') {
        this.handlePageVisible()
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
    this.startHeartbeat()
  }

  private startHeartbeat(): void {
    this.lastHeartbeat = Date.now()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const gap = now - this.lastHeartbeat
      this.lastHeartbeat = now

      if (gap > HEARTBEAT_THRESHOLD_MS) {
        if (document.visibilityState === 'hidden') {
          this.missedHeartbeat = true
        } else {
          this.handleSleepDetected('heartbeat', gap)
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private handlePageHide(): void {
    if (this.client.options?.ws?.disconnectOnPageHide) {
      this.client.close()
      if (this.client.options?.debug) {
        console.log('TypeFerry: Disconnected on page hide')
      }
    }
  }

  /**
   * Unified entry point for sleep detection from both the heartbeat
   * timer and `visibilitychange`. One recovery owns the full lifecycle to prevent
   * duplicate reconnects when both fire after wake.
   */
  private handleSleepDetected(source: string, durationMs: number): void {
    if (this.destroyed || this.recovery) return

    const recovery = new AbortController()
    this.recovery = recovery
    this.missedHeartbeat = false

    if (this.client.options?.debug) {
      console.log(
        `TypeFerry: Sleep detected via ${source} (${Math.round(durationMs / 1000)}s gap), reconnecting`,
      )
    }

    this.finishRecovery(recovery, this.runHookAndReconnect(recovery))
  }

  /**
   * A token change still needs a new handshake. Otherwise delivered traffic
   * allows the existing socket to survive a timer gap without replaying RPCs.
   * Socket identity prevents a late hook/probe from retiring a newer connection.
   */
  private async runHookAndReconnect(recovery: AbortController): Promise<void> {
    const { signal } = recovery
    const socket = this.client.clientSocket.socket
    const token = this.client.context.token
    const hookSucceeded = this.onBeforeReconnect
      ? await this.runBeforeReconnect(signal)
      : true
    if (signal.aborted) return

    const currentSocket = this.client.clientSocket.socket
    if (!hookSucceeded || this.needsTokenHandshake(socket, token)) {
      await this.replaceConnection(recovery)
      return
    }

    if (currentSocket !== socket) {
      if (this.initializedSocket !== this.client.clientSocket.socket) {
        await this.waitForInitialization(signal)
      }
      return
    }

    if (
      this.client.clientSocket.ready &&
      this.client.initialized &&
      this.initializedSocket === socket &&
      socket
    ) {
      const receivedTraffic = await this.waitForTraffic(socket, signal)
      if (signal.aborted) return
      if (this.needsTokenHandshake(socket, token)) {
        await this.replaceConnection(recovery)
        return
      }
      if (this.client.clientSocket.socket !== socket) {
        if (this.initializedSocket !== this.client.clientSocket.socket) {
          await this.waitForInitialization(signal)
        }
        return
      }
      if (receivedTraffic && this.client.clientSocket.ready) return
    }

    // Join transport-owned backoff, handshake or subscription initialization.
    if (
      this.client.clientSocket.connecting ||
      this.client.clientSocket.socket?.readyState === WebSocketState.CONNECTING ||
      this.client.initializing ||
      (this.client.clientSocket.ready && this.initializedSocket !== currentSocket)
    ) {
      await this.waitForInitialization(signal)
      return
    }

    await this.replaceConnection(recovery)
  }

  /**
   * A competing reconnect may already have adopted the refreshed token. Keep
   * that successor, but never mistake a newer socket for a newer handshake.
   */
  private needsTokenHandshake(
    previousSocket: WebSocket | undefined,
    previousToken: string | undefined,
  ): boolean {
    const token = this.client.context.token
    if (token === previousToken) return false

    const socket = this.client.clientSocket.socket
    if (!socket || socket === previousSocket) return true

    return new URL(socket.url).searchParams.get('token') !== (token ?? null)
  }

  private async runBeforeReconnect(signal: AbortSignal): Promise<boolean> {
    const hook = this.onBeforeReconnect
    if (!hook) return true

    for (let attempt = 0; attempt < HOOK_RETRY_ATTEMPTS; attempt++) {
      if (signal.aborted) return false
      try {
        const succeeded = await waitForRecovery(signal, RECOVERY_TIMEOUT_MS, finish => {
          void hook().then(() => finish(true), () => finish(false))
        })
        if (succeeded) return true
      } catch {
        // Synchronous hook failures use the same bounded retry as rejections.
      }
      if (attempt < HOOK_RETRY_ATTEMPTS - 1) {
        await waitForRecovery(signal, HOOK_RETRY_DELAY_MS)
      }
    }
    return false
  }

  /**
   * Determines whether reconnection is needed and triggers it. Routes
   * through `handleSleepDetected` for deduplication with the heartbeat.
   */
  private handlePageVisible(): void {
    const hiddenDuration = this.hiddenAt ? Date.now() - this.hiddenAt : 0
    this.hiddenAt = null

    const socket = this.client.clientSocket.socket
    const isConnected =
      socket?.readyState === WebSocket.OPEN && this.client.initialized
    const needsReconnect =
      !isConnected ||
      this.missedHeartbeat ||
      Date.now() - this.lastHeartbeat > HEARTBEAT_THRESHOLD_MS ||
      hiddenDuration > FORCE_RECONNECT_THRESHOLD

    if (needsReconnect) {
      this.handleSleepDetected('visibility', hiddenDuration)
      return
    }

    if (this.idleTimer) {
      this.idleTimer.stop()
      this.idleTimer.start()
    }
  }

}
