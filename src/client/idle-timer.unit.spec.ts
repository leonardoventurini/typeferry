import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientEvents } from '../utils'
import { IdleTimer } from './idle-timer'

function createMockClient() {
  return {
    options: { debug: false },
    clientSocket: {
      socket: { readyState: WebSocket.OPEN } as Record<string, unknown>,
      connect: vi.fn(),
    },
    close: vi.fn(),
    on: vi.fn(),
    waitFor: vi.fn().mockResolvedValue(undefined),
  }
}

describe('IdleTimer', () => {
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    vi.useFakeTimers()
    mockClient = createMockClient()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should call client.close() after timeout expires', () => {
    const timer = new IdleTimer(mockClient as never, 5000)

    // The setup defers the first start via setTimeout(..., 0)
    vi.advanceTimersByTime(0)

    // Advance past the timeout
    vi.advanceTimersByTime(5000)

    expect(mockClient.close).toHaveBeenCalled()

    timer.destroy()
  })

  it('should not close before timeout expires', () => {
    const timer = new IdleTimer(mockClient as never, 5000)
    vi.advanceTimersByTime(0)

    vi.advanceTimersByTime(4999)

    expect(mockClient.close).not.toHaveBeenCalled()

    timer.destroy()
  })

  it('stop() should prevent close from firing', () => {
    const timer = new IdleTimer(mockClient as never, 5000)
    vi.advanceTimersByTime(0)

    vi.advanceTimersByTime(3000)
    timer.stop()
    vi.advanceTimersByTime(5000)

    expect(mockClient.close).not.toHaveBeenCalled()

    timer.destroy()
  })

  it('reset() should restart the timer', async () => {
    const timer = new IdleTimer(mockClient as never, 5000)
    vi.advanceTimersByTime(0)

    vi.advanceTimersByTime(4000)
    await timer.reset()

    // 4000ms used, reset, now another 4999ms should not trigger
    vi.advanceTimersByTime(4999)
    expect(mockClient.close).not.toHaveBeenCalled()

    // But 1ms more should
    vi.advanceTimersByTime(1)
    expect(mockClient.close).toHaveBeenCalled()

    timer.destroy()
  })

  it('reset() should attempt connection when socket is disconnected', async () => {
    mockClient.clientSocket.socket.readyState = WebSocket.CLOSED

    const timer = new IdleTimer(mockClient as never, 5000)

    await timer.reset()

    expect(mockClient.clientSocket.connect).toHaveBeenCalled()
    expect(mockClient.waitFor).toHaveBeenCalledWith(
      ClientEvents.WEBSOCKET_CONNECTED,
      10000,
    )

    timer.destroy()
  })

  it('reset() should not reconnect when socket is connected', async () => {
    mockClient.clientSocket.socket.readyState = WebSocket.OPEN

    const timer = new IdleTimer(mockClient as never, 5000)

    await timer.reset()

    expect(mockClient.clientSocket.connect).not.toHaveBeenCalled()

    timer.destroy()
  })

  it('destroy() should clean up and prevent further timeouts', () => {
    const timer = new IdleTimer(mockClient as never, 5000)
    vi.advanceTimersByTime(0)

    timer.destroy()
    vi.advanceTimersByTime(10000)

    expect(mockClient.close).not.toHaveBeenCalled()
  })
})
