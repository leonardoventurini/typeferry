import { ClientEvents } from '../utils'
import type { Client } from './client'
import type { IdleTimer } from './idle-timer'

/**
 * Time threshold below which we trust the socket connection is healthy.
 * If hidden for less than this, we only reconnect if the socket is actually
 * disconnected.
 */
const FORCE_RECONNECT_THRESHOLD = 60 * 60 * 1000 // 1 hour

/** Heartbeat fires every 30s to detect OS sleep gaps. */
const HEARTBEAT_INTERVAL_MS = 30_000

/** If the gap between heartbeats exceeds 2x the interval, we were sleeping. */
const HEARTBEAT_THRESHOLD_MS = 60_000

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
  private reconnecting = false

  constructor(
    private client: Client,
    private idleTimer: IdleTimer | null,
  ) {
    this.setup()
  }

  /**
   * Tears down the existing socket and creates a fresh connection.
   * After tab sleep, the socket may be in a stale state — so we always
   * do a full cleanup before reconnecting.
   */
  reconnect(): void {
    const wasInitialized = this.client.initialized

    this.client.initialized = false
    this.client.initializing = false

    const existingSocket = this.client.clientSocket.socket
    if (existingSocket) {
      existingSocket.close()
      this.client.clientSocket.socket = undefined
    }

    this.client.clientSocket.connect()
    this.lastHeartbeat = Date.now()
    this.reconnecting = false

    if (wasInitialized) {
      this.client.emit(ClientEvents.WEBSOCKET_RECONNECTING)
    }
  }

  /** Removes all listeners and timers to prevent memory leaks. */
  destroy(): void {
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    this.visibilityHandler = null
    this.stopHeartbeat()
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
        this.handleSleepDetected('heartbeat', gap)
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
        console.log('Bifrost: Disconnected on page hide')
      }
    }
  }

  /**
   * Unified entry point for sleep detection from both the heartbeat
   * timer and `visibilitychange`. Uses `reconnecting` to prevent
   * duplicate reconnects when both fire after wake.
   */
  private handleSleepDetected(source: string, durationMs: number): void {
    if (this.reconnecting) return
    this.reconnecting = true

    if (this.client.options?.debug) {
      console.log(
        `Bifrost: Sleep detected via ${source} (${Math.round(durationMs / 1000)}s gap), reconnecting`,
      )
    }

    this.runHookAndReconnect()
  }

  /**
   * Runs the pre-reconnect hook with bounded retries (WiFi may take
   * seconds to reconnect after wake), then reconnects. Falls back to
   * reconnecting even if all retry attempts fail.
   */
  private async runHookAndReconnect(): Promise<void> {
    if (this.onBeforeReconnect) {
      for (let attempt = 0; attempt < HOOK_RETRY_ATTEMPTS; attempt++) {
        try {
          await this.onBeforeReconnect()
          break
        } catch {
          const isLastAttempt = attempt === HOOK_RETRY_ATTEMPTS - 1
          if (!isLastAttempt) {
            await this.delay(HOOK_RETRY_DELAY_MS)
          }
        }
      }
    }
    this.reconnect()
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
      !isConnected || hiddenDuration > FORCE_RECONNECT_THRESHOLD

    if (needsReconnect) {
      this.handleSleepDetected('visibility', hiddenDuration)
      return
    }

    if (this.idleTimer) {
      this.idleTimer.stop()
      this.idleTimer.start()
    }
  }

  /** Promisified delay for hook retry backoff. */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
