import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { broadcastTokenRefresh, setupCrossTabSync } from './cross-tab-sync'

// ---------------------------------------------------------------------------
// BroadcastChannel mock
// ---------------------------------------------------------------------------

type MessageHandler = (event: { data: any }) => void

class BroadcastChannelMock {
  static instances: BroadcastChannelMock[] = []
  static reset() {
    BroadcastChannelMock.instances = []
  }

  public name: string
  public addEventListener = vi.fn(
    (_type: string, handler: MessageHandler) => {
      this._handler = handler
    },
  )
  public removeEventListener = vi.fn()
  public postMessage = vi.fn()
  public close = vi.fn()

  /** The most recently registered "message" handler for easy simulation. */
  private _handler: MessageHandler | null = null

  constructor(name: string) {
    this.name = name
    BroadcastChannelMock.instances.push(this)
  }

  /** Helper: simulate an incoming message on this channel. */
  simulateMessage(data: any) {
    if (this._handler) {
      this._handler({ data })
    }
  }
}

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    updateContext: vi.fn(),
    emit: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cross-tab-sync', () => {
  beforeEach(() => {
    BroadcastChannelMock.reset()
    vi.stubGlobal('BroadcastChannel', BroadcastChannelMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // -----------------------------------------------------------------------
  // setupCrossTabSync
  // -----------------------------------------------------------------------

  describe('setupCrossTabSync', () => {
    it('returns a noop cleanup when BroadcastChannel is unavailable (SSR)', () => {
      vi.stubGlobal('BroadcastChannel', undefined)

      const client = createMockClient()
      const cleanup = setupCrossTabSync(client as any, {
        channelName: 'test-channel',
      })

      expect(typeof cleanup).toBe('function')
      // Should not throw
      cleanup()
      // No channel should have been created
      expect(BroadcastChannelMock.instances).toHaveLength(0)
    })

    it('creates a BroadcastChannel with the configured channelName', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, { channelName: 'my-app-tokens' })

      expect(BroadcastChannelMock.instances).toHaveLength(1)
      expect(BroadcastChannelMock.instances[0].name).toBe('my-app-tokens')
    })

    it('registers a message event listener on the channel', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      expect(channel.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      )
    })

    it('updates client context when a valid TOKEN_REFRESHED message is received', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      channel.simulateMessage({
        type: 'TOKEN_REFRESHED',
        token: 'new-jwt',
        exp: 1700000000,
      })

      expect(client.updateContext).toHaveBeenCalledOnce()
      expect(client.updateContext).toHaveBeenCalledWith({
        token: 'new-jwt',
        exp: 1700000000,
      })
    })

    it('includes iat and _tokenReceivedAt when iat is present in the message', () => {
      const client = createMockClient()
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(9999999)

      setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      channel.simulateMessage({
        type: 'TOKEN_REFRESHED',
        token: 'jwt-with-iat',
        exp: 1700000000,
        iat: 1699990000,
      })

      expect(client.updateContext).toHaveBeenCalledWith({
        token: 'jwt-with-iat',
        exp: 1700000000,
        iat: 1699990000,
        _tokenReceivedAt: 9999999,
      })

      nowSpy.mockRestore()
    })

    it('does not set iat or _tokenReceivedAt when iat is not a number', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      channel.simulateMessage({
        type: 'TOKEN_REFRESHED',
        token: 'tok',
        exp: 100,
        iat: 'not-a-number',
      })

      expect(client.updateContext).toHaveBeenCalledWith({
        token: 'tok',
        exp: 100,
      })
    })

    it('emits tokenRefreshedEvent on the client when configured', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, {
        channelName: 'ch',
        tokenRefreshedEvent: 'auth:token-refreshed',
      })

      const channel = BroadcastChannelMock.instances[0]
      channel.simulateMessage({
        type: 'TOKEN_REFRESHED',
        token: 'tok',
        exp: 200,
      })

      expect(client.emit).toHaveBeenCalledOnce()
      expect(client.emit).toHaveBeenCalledWith('auth:token-refreshed', {
        token: 'tok',
        exp: 200,
      })
    })

    it('does not emit when tokenRefreshedEvent is not configured', () => {
      const client = createMockClient()
      setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      channel.simulateMessage({
        type: 'TOKEN_REFRESHED',
        token: 'tok',
        exp: 200,
      })

      expect(client.emit).not.toHaveBeenCalled()
    })

    describe('ignores invalid messages', () => {
      it.each([
        ['wrong type', { type: 'WRONG_TYPE', token: 'tok', exp: 100 }],
        ['missing type', { token: 'tok', exp: 100 }],
        ['missing token', { type: 'TOKEN_REFRESHED', exp: 100 }],
        ['non-string token', { type: 'TOKEN_REFRESHED', token: 123, exp: 100 }],
        ['missing exp', { type: 'TOKEN_REFRESHED', token: 'tok' }],
        ['non-number exp', { type: 'TOKEN_REFRESHED', token: 'tok', exp: 'str' }],
        ['null data', null],
        ['undefined data', undefined],
        ['empty object', {}],
      ])('does not call updateContext for %s', (_label, data) => {
        const client = createMockClient()
        setupCrossTabSync(client as any, { channelName: 'ch' })

        const channel = BroadcastChannelMock.instances[0]
        channel.simulateMessage(data)

        expect(client.updateContext).not.toHaveBeenCalled()
        expect(client.emit).not.toHaveBeenCalled()
      })
    })

    it('cleanup removes listener and closes the channel', () => {
      const client = createMockClient()
      const cleanup = setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]

      cleanup()

      expect(channel.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      )
      expect(channel.close).toHaveBeenCalledOnce()
    })

    it('cleanup removes the exact handler that was registered', () => {
      const client = createMockClient()
      const cleanup = setupCrossTabSync(client as any, { channelName: 'ch' })

      const channel = BroadcastChannelMock.instances[0]
      const registeredHandler = channel.addEventListener.mock.calls[0][1]

      cleanup()

      expect(channel.removeEventListener).toHaveBeenCalledWith(
        'message',
        registeredHandler,
      )
    })
  })

  // -----------------------------------------------------------------------
  // broadcastTokenRefresh
  // -----------------------------------------------------------------------

  describe('broadcastTokenRefresh', () => {
    it('is a no-op when BroadcastChannel is unavailable (SSR)', () => {
      vi.stubGlobal('BroadcastChannel', undefined)

      // Should not throw
      broadcastTokenRefresh('ch', 'tok', 100)

      expect(BroadcastChannelMock.instances).toHaveLength(0)
    })

    it('creates a channel, posts a message, and closes', () => {
      broadcastTokenRefresh('sync-channel', 'my-token', 1700000000)

      expect(BroadcastChannelMock.instances).toHaveLength(1)

      const channel = BroadcastChannelMock.instances[0]
      expect(channel.name).toBe('sync-channel')

      expect(channel.postMessage).toHaveBeenCalledOnce()
      expect(channel.postMessage).toHaveBeenCalledWith({
        type: 'TOKEN_REFRESHED',
        token: 'my-token',
        exp: 1700000000,
        iat: undefined,
      })

      expect(channel.close).toHaveBeenCalledOnce()
    })

    it('includes iat in the message when provided', () => {
      broadcastTokenRefresh('ch', 'tok', 2000, 1000)

      const channel = BroadcastChannelMock.instances[0]

      expect(channel.postMessage).toHaveBeenCalledWith({
        type: 'TOKEN_REFRESHED',
        token: 'tok',
        exp: 2000,
        iat: 1000,
      })
    })

    it('closes the channel after posting the message', () => {
      broadcastTokenRefresh('ch', 'tok', 100)

      const channel = BroadcastChannelMock.instances[0]

      // Verify close was called
      expect(channel.close).toHaveBeenCalledOnce()

      // Verify ordering: postMessage was called before close
      const postOrder = channel.postMessage.mock.invocationCallOrder[0]
      const closeOrder = channel.close.mock.invocationCallOrder[0]
      expect(postOrder).toBeLessThan(closeOrder)
    })
  })
})
