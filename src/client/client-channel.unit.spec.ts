import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BifrostEvents, Methods } from '../utils'
import { ClientChannel } from './client-channel'
import { LogLevel } from './logger'

describe('ClientChannel', () => {
  let channel: ClientChannel
  let mockClient: any

  beforeEach(() => {
    vi.useFakeTimers()

    mockClient = {
      call: vi.fn().mockResolvedValue({ 'test-event': true }),
      logger: {
        subscription: vi.fn(),
      },
    }

    channel = new ClientChannel('test-channel')
    channel.setClient(mockClient)
  })

  afterEach(() => {
    vi.useRealTimers()
    channel.removeAllListeners()
  })

  describe('constructor', () => {
    it('sets the channel name', () => {
      expect(channel.name).toBe('test-channel')
    })

    it('throws if name is not a string', () => {
      expect(() => new ClientChannel('' as any)).toThrow(
        'the channel name needs to be a string',
      )
      expect(() => new ClientChannel(null as any)).toThrow(
        'the channel name needs to be a string',
      )
      expect(() => new ClientChannel(123 as any)).toThrow(
        'the channel name needs to be a string',
      )
    })
  })

  describe('subscribe', () => {
    it('adds events to the events set', async () => {
      const promise = channel.subscribe('my-event')

      // Let the debounce timer fire
      await vi.advanceTimersByTimeAsync(100)

      await promise

      expect(channel.events.has('my-event')).toBe(true)
    })

    it('accepts an array of events', async () => {
      const promise = channel.subscribe(['e1', 'e2'])

      await vi.advanceTimersByTimeAsync(100)

      await promise

      expect(channel.events.has('e1')).toBe(true)
      expect(channel.events.has('e2')).toBe(true)
    })

    it('returns empty object for empty array', async () => {
      const result = await channel.subscribe([])
      expect(result).toEqual({})
    })

    it('calls RPC_ON via client.call after debounce', async () => {
      const promise = channel.subscribe('my-event')

      await vi.advanceTimersByTimeAsync(100)

      await promise

      expect(mockClient.call).toHaveBeenCalledWith(Methods.RPC_ON, {
        events: ['my-event'],
        channel: 'test-channel',
      })
    })

    it('debounces multiple subscribe calls', async () => {
      const p1 = channel.subscribe('e1')
      const p2 = channel.subscribe('e2')

      await vi.advanceTimersByTimeAsync(100)

      await Promise.all([p1, p2])

      // Both events should have been batched into one call
      expect(mockClient.call).toHaveBeenCalledTimes(1)
      expect(mockClient.call).toHaveBeenCalledWith(Methods.RPC_ON, {
        events: ['e1', 'e2'],
        channel: 'test-channel',
      })
    })

    it('clears existing debounce timeout when called again (line 132)', async () => {
      // First subscribe sets a timeout
      const p1 = channel.subscribe('e1')
      // Second subscribe should clear the first timeout (line 132) and set a new one
      const p2 = channel.subscribe('e2')

      await vi.advanceTimersByTimeAsync(100)
      await Promise.all([p1, p2])

      // Only one call should have been made (the debounced one)
      expect(mockClient.call).toHaveBeenCalledTimes(1)
    })

    it('returns {} when waitFor times out (lines 149-155)', async () => {
      // Prevent commitPendingSubscriptions from emitting by making the
      // pendingSubscriptions empty before the debounce fires.
      // Instead, we just never emit the event so waitFor times out.
      // Use a very short timeout by manipulating the channel so that
      // the waitFor hits its 15s timeout. For unit test speed, we
      // advance timers past the 15s timeout.
      mockClient.call.mockImplementation(() => new Promise(() => {})) // never resolves

      const promise = channel.subscribe('fail-event')

      // Advance past the 100ms debounce
      await vi.advanceTimersByTimeAsync(100)

      // Advance past the 15s waitFor timeout
      await vi.advanceTimersByTimeAsync(15000)

      const result = await promise

      expect(result).toEqual({})
      expect(mockClient.logger.subscription).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'Failed to commit subscriptions',
        expect.objectContaining({ channel: 'test-channel' }),
        expect.any(Error),
      )
    })

    it('returns {} when commitPendingSubscriptions catches an error', async () => {
      // Make client.call reject -- commitPendingSubscriptions catches and emits {}
      mockClient.call.mockRejectedValueOnce(new Error('rpc failed'))

      const promise = channel.subscribe('x')

      await vi.advanceTimersByTimeAsync(100)

      const result = await promise

      // waitFor resolves with {} from the emit, subscribe returns it
      expect(result).toEqual({})
    })
  })

  describe('unsubscribe', () => {
    it('removes events from the events set', async () => {
      channel.events.add('my-event')
      mockClient.call.mockResolvedValue({ 'my-event': true })

      const promise = channel.unsubscribe('my-event')
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(channel.events.has('my-event')).toBe(false)
    })

    it('accepts an array of events', async () => {
      channel.events.add('e1')
      channel.events.add('e2')
      mockClient.call.mockResolvedValue({})

      const promise = channel.unsubscribe(['e1', 'e2'])
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(channel.events.has('e1')).toBe(false)
      expect(channel.events.has('e2')).toBe(false)
    })

    it('returns empty object for empty array', async () => {
      const result = await channel.unsubscribe([])
      expect(result).toEqual({})
    })

    it('calls RPC_OFF via client.call after debounce', async () => {
      channel.events.add('my-event')
      mockClient.call.mockResolvedValue({ 'my-event': true })

      const promise = channel.unsubscribe('my-event')
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockClient.call).toHaveBeenCalledWith(Methods.RPC_OFF, {
        events: ['my-event'],
        channel: 'test-channel',
      })
    })

    it('clears existing debounce timeout when called again', async () => {
      channel.events.add('e1')
      channel.events.add('e2')
      mockClient.call.mockResolvedValue({})

      const p1 = channel.unsubscribe('e1')
      const p2 = channel.unsubscribe('e2')

      await vi.advanceTimersByTimeAsync(100)
      await Promise.all([p1, p2])

      expect(mockClient.call).toHaveBeenCalledTimes(1)
    })

    it('returns {} when waitFor times out (lines 149-155)', async () => {
      channel.events.add('fail-event')
      mockClient.call.mockImplementation(() => new Promise(() => {})) // never resolves

      const promise = channel.unsubscribe('fail-event')

      // Advance past debounce and waitFor timeout
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(15000)

      const result = await promise

      expect(result).toEqual({})
      expect(mockClient.logger.subscription).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'Failed to commit unsubscriptions',
        expect.objectContaining({ channel: 'test-channel' }),
        expect.any(Error),
      )
    })
  })

  describe('resubscribe', () => {
    it('re-subscribes all current events', async () => {
      channel.events.add('e1')
      channel.events.add('e2')
      mockClient.call.mockResolvedValue({ e1: true, e2: true })

      const promise = channel.resubscribe()
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockClient.call).toHaveBeenCalledWith(Methods.RPC_ON, {
        events: expect.arrayContaining(['e1', 'e2']),
        channel: 'test-channel',
      })
    })
  })

  describe('wait', () => {
    it('resolves with data when event fires', async () => {
      const promise = channel.wait('test')
      channel.emit('test', 'hello')
      const result = await promise
      expect(result).toBe('hello')
    })

    it('resolves with true when event fires without data (line 172)', async () => {
      const promise = channel.wait('test')
      channel.emit('test')
      const result = await promise
      expect(result).toBe(true)
    })

    it('calls callback and resolves with its return value', async () => {
      const cb = vi.fn().mockReturnValue('transformed')
      const promise = channel.wait('test', cb)
      channel.emit('test', 'data')
      const result = await promise
      expect(cb).toHaveBeenCalledWith('data')
      expect(result).toBe('transformed')
    })
  })

  describe('timeout', () => {
    it('resolves to true when event is not fired within timeout', async () => {
      const promise = channel.timeout('no-fire', 50)
      await vi.advanceTimersByTimeAsync(50)
      const result = await promise
      expect(result).toBe(true)
    })

    it('resolves to false when event fires before timeout', async () => {
      const promise = channel.timeout('fires', 200)
      channel.emit('fires')
      const result = await promise
      expect(result).toBe(false)
    })
  })

  describe('iterator', () => {
    it('returns an async iterator for the event', () => {
      const iter = channel.iterator('test-event')
      expect(iter[Symbol.asyncIterator]).toBeDefined()
      expect(typeof iter.next).toBe('function')
      expect(typeof iter.return).toBe('function')
    })
  })

  describe('commitPendingSubscriptions', () => {
    it('emits {} (not null) when RPC_ON returns null', async () => {
      mockClient.call.mockResolvedValueOnce(null)

      const emitSpy = vi.fn()
      channel.on(BifrostEvents.COMMIT_PENDING_SUBSCRIPTIONS, emitSpy)

      channel.events.add('e1')
      ;(channel as any).pendingSubscriptions.add('e1')

      await channel.commitPendingSubscriptions()

      expect(emitSpy).toHaveBeenCalledWith({})
    })

    it('does nothing when pendingSubscriptions is empty', async () => {
      await channel.commitPendingSubscriptions()
      expect(mockClient.call).not.toHaveBeenCalled()
    })
  })

  describe('commitPendingUnsubscriptions', () => {
    it('emits result when RPC_OFF succeeds', async () => {
      mockClient.call.mockResolvedValueOnce({ e1: true })

      const emitSpy = vi.fn()
      channel.on(BifrostEvents.COMMIT_PENDING_UNSUBSCRIPTIONS, emitSpy)

      ;(channel as any).pendingUnsubscriptions.add('e1')

      await channel.commitPendingUnsubscriptions()

      expect(emitSpy).toHaveBeenCalledWith({ e1: true })
    })

    it('emits {} when RPC_OFF throws', async () => {
      mockClient.call.mockRejectedValueOnce(new Error('rpc failed'))

      const emitSpy = vi.fn()
      channel.on(BifrostEvents.COMMIT_PENDING_UNSUBSCRIPTIONS, emitSpy)

      ;(channel as any).pendingUnsubscriptions.add('e1')

      await channel.commitPendingUnsubscriptions()

      expect(emitSpy).toHaveBeenCalledWith({})
    })

    it('does nothing when pendingUnsubscriptions is empty', async () => {
      await channel.commitPendingUnsubscriptions()
      expect(mockClient.call).not.toHaveBeenCalled()
    })
  })
})
