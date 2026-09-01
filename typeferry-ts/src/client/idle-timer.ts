import { throttle } from '../utils/lodash'

import { ClientEvents, Environment } from '../utils'
import type { Client } from './client'

type Timeout = ReturnType<typeof setTimeout>
type ThrottledFunction = ReturnType<typeof throttle>

const ACTIVITY_EVENTS = [
  'focus',
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'pageshow',
  'pagehide',
]

/**
 * Disconnects the client after a period of inactivity.
 * Only instantiated when `idlenessTimeout` is configured.
 *
 * Extracted from the former IdleTimeout class to isolate idle-disconnect
 * logic from visibility-based reconnection (now in VisibilityManager).
 */
export class IdleTimer {
  private timerId: Timeout | null = null
  private resetHandler: ThrottledFunction | null = null

  constructor(
    private client: Client,
    private timeout: number,
  ) {
    this.setup()
  }

  /** Starts the idle countdown. Fires `client.close()` when it expires. */
  start(): void {
    if (typeof this.timeout !== 'number') return
    if (!Environment.isBrowser && !Environment.isTest) return

    this.timerId = setTimeout(() => {
      this.client.close()
      if (this.client.options?.debug) {
        console.log('TypeFerry: Disconnected due to inactivity')
      }
    }, this.timeout)
  }

  /** Clears the current idle countdown. */
  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  /**
   * Resets the idle timer and reconnects if the socket is disconnected.
   * Called on user activity (mousemove, keydown, etc.).
   *
   * Only reconnects if the socket is actually down — does NOT force
   * reconnection when initialized=false, which would create loops.
   */
  /**
   * Resets the idle timer and reconnects if the socket is disconnected.
   * Defers restarting the idle countdown until after the connection is
   * established to prevent the timer from firing mid-reconnect.
   */
  async reset(): Promise<void> {
    this.stop()

    const socket = this.client.clientSocket.socket
    if (socket?.readyState === WebSocket.OPEN) {
      this.start()
      return
    }

    this.client.clientSocket.connect()
    await this.client.waitFor(ClientEvents.WEBSOCKET_CONNECTED, 10000)
    this.start()
  }

  /** Removes all event listeners and cleans up resources. */
  destroy(): void {
    this.stop()

    if (this.resetHandler) {
      this.resetHandler.cancel()
    }

    if (typeof window !== 'undefined' && this.resetHandler) {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, this.resetHandler)
      }
    }

    this.resetHandler = null
  }

  private setup(): void {
    this.client.on(ClientEvents.CLOSE, () => this.stop())

    // Defer the first start so the constructor completes first
    setTimeout(() => this.start(), 0)

    if (typeof window === 'undefined') return

    this.resetHandler = throttle(this.reset.bind(this), this.timeout / 2, {
      leading: true,
      trailing: true,
    })

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, this.resetHandler)
    }
  }
}
