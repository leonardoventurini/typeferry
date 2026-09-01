import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientEvents, MessageType, Presentation } from '../utils'
import { ClientSocket } from './client-socket'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    options: { host: 'localhost', port: 3000, secure: false, meta: {} },
    context: { token: 'test-token' },
    uuid: 'test-uuid',
    logger: {
      connection: vi.fn(),
    },
    emit: vi.fn(),
    authenticated: false,
    initialized: false,
    initializing: false,
    initialize: vi.fn(),
    handleEvent: vi.fn(),
    visibilityManager: {
      reconnect: vi.fn(),
    },
  }
}

/**
 * Minimal mock WebSocket that tracks calls and lets us fire handlers.
 */
class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static created = 0

  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []

  constructor() {
    MockWebSocket.created += 1
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  }

  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

describe('ClientSocket', () => {
  let mockClient: ReturnType<typeof createMockClient>
  let socket: ClientSocket

  beforeEach(() => {
    vi.useFakeTimers()

    // Stub global WebSocket
    vi.stubGlobal('WebSocket', MockWebSocket)
    ;(globalThis as any).WebSocket.OPEN = MockWebSocket.OPEN
    ;(globalThis as any).WebSocket.CLOSED = MockWebSocket.CLOSED

    mockClient = createMockClient()
    socket = new ClientSocket(mockClient as any)
    MockWebSocket.created = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // -------------------------------------------------------------------------
  // Lines 217-219: emitWithAck rejects when socket not ready
  // -------------------------------------------------------------------------

  describe('emitWithAck()', () => {
    it('rejects immediately when socket is not ready', async () => {
      // socket.socket is undefined, so ready is false
      expect(socket.ready).toBe(false)

      await expect(
        socket.emitWithAck('rpc', { method: 'test.method' }),
      ).rejects.toThrow('Socket not ready')
    })
  })

  // -------------------------------------------------------------------------
  // Lines 258-261: handleMessage — auth and ping branches
  // -------------------------------------------------------------------------

  describe('handleMessage (via ws.onmessage)', () => {
    beforeEach(() => {
      // Connect to create a socket, then fire open
      socket.connect()
      const ws = socket.socket as unknown as MockWebSocket
      ws.onopen?.()
    })

    it('handles auth message by setting authenticated and calling initialize', () => {
      const ws = socket.socket as unknown as MockWebSocket

      const authMsg = Presentation.encode({
        t: MessageType.AUTH,
        authenticated: true,
      })

      ws.onmessage?.({ data: authMsg })

      expect(mockClient.authenticated).toBe(true)
      expect(mockClient.initialize).toHaveBeenCalled()
    })

    it('handles ping message by responding with pong', () => {
      const ws = socket.socket as unknown as MockWebSocket

      const pingMsg = Presentation.encode({ t: MessageType.PING })
      ws.onmessage?.({ data: pingMsg })

      // Last sent message should be a pong
      const lastSent = ws.sent[ws.sent.length - 1]
      const decoded = Presentation.decode<{ t: string }>(lastSent)
      expect(decoded.t).toBe(MessageType.PONG)
    })

    it('handles event message by delegating to client.handleEvent', () => {
      const ws = socket.socket as unknown as MockWebSocket

      const eventMsg = Presentation.encode({
        t: MessageType.EVENT,
        uuid: 'evt-uuid',
        event: 'some.event',
        params: { data: 123 },
      })

      ws.onmessage?.({ data: eventMsg })

      expect(mockClient.handleEvent).toHaveBeenCalled()
    })

    it('ignores malformed messages without throwing', () => {
      const ws = socket.socket as unknown as MockWebSocket

      // This should not throw
      ws.onmessage?.({ data: 'not-valid-json{{{' })
    })
  })

  // -------------------------------------------------------------------------
  // Lines 359-363: scheduleReconnect — exhausted attempts
  // -------------------------------------------------------------------------

  it('cancels scheduled backoff before an explicit connection', () => {
    const reconnectable = socket as unknown as {
      scheduleReconnect: () => void
    }

    reconnectable.scheduleReconnect()
    socket.connect()
    vi.advanceTimersByTime(20_000)

    expect(MockWebSocket.created).toBe(1)
  })

  describe('scheduleReconnect (exhausted attempts)', () => {
    it('calls visibilityManager.reconnect after exhausting all attempts', () => {
      socket.connect()
      const ws = socket.socket as unknown as MockWebSocket
      ws.onopen?.()

      // Simulate 11 consecutive disconnects without successful reconnection
      // Each handleClose calls scheduleReconnect, which increments reconnectAttempt
      for (let i = 0; i < 11; i++) {
        // Get current ws reference and fire its close handler
        const currentWs = socket.socket as unknown as MockWebSocket
        if (currentWs?.onclose) {
          currentWs.onclose()
        }

        // If there's a pending reconnect timer, advance past it to create new socket
        if (i < 10) {
          vi.advanceTimersByTime(20_000) // advance past max delay + jitter
        }
      }

      // After 11 close events (attempt > 10), visibilityManager.reconnect should be called
      expect(mockClient.visibilityManager.reconnect).toHaveBeenCalledTimes(1)
    })

    it('only calls visibilityManager.reconnect once (prevents infinite loop)', () => {
      socket.connect()
      const ws = socket.socket as unknown as MockWebSocket
      ws.onopen?.()

      // Exhaust all attempts (11+ closes)
      for (let i = 0; i < 15; i++) {
        const currentWs = socket.socket as unknown as MockWebSocket
        if (currentWs?.onclose) {
          currentWs.onclose()
        }
        vi.advanceTimersByTime(20_000)
      }

      // Should still only be called once due to exhaustedReconnect flag
      expect(mockClient.visibilityManager.reconnect).toHaveBeenCalledTimes(1)
    })

    it('does not call visibilityManager.reconnect when stopped', () => {
      socket.connect()
      const ws = socket.socket as unknown as MockWebSocket
      ws.onopen?.()

      // Stop the socket (simulates intentional close)
      socket.stopped = true

      // Fire close
      ws.onclose?.()

      expect(mockClient.visibilityManager.reconnect).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // send() when not ready
  // -------------------------------------------------------------------------

  describe('send()', () => {
    it('logs a warning and does not send when socket is not ready', () => {
      socket.send('rpc', { method: 'test' })

      expect(mockClient.logger.connection).toHaveBeenCalledWith(
        expect.any(Number),
        'Socket not ready, cannot send',
        expect.objectContaining({ ready: false }),
      )
    })
  })
})
