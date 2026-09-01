import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Event } from './event'

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockChannel(overrides: Record<string, any> = {}) {
  return {
    channelName: 'test-channel',
    propagate: vi.fn(),
    ...overrides,
  }
}

function createMockServer(overrides: Record<string, any> = {}) {
  return {
    events: new Map(),
    redisTransport: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Event', () => {
  describe('constructor', () => {
    it('sets defaults when no options provided', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('my-event', server as any, channel as any)

      expect(event.name).toBe('my-event')
      expect(event.isProtected).toBe(false)
      expect(event.cluster).toBe(false)
      expect(event.excludeOriginator).toBe(false)
      expect(event.uuid).toBeTruthy()
      expect(event.server).toBe(server)
      expect(event.channel).toBe(channel)
    })

    it('sets isProtected from opts.protected', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        protected: true,
      })

      expect(event.isProtected).toBe(true)
    })

    it('sets cluster flag', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
      })

      expect(event.cluster).toBe(true)
    })

    it('sets excludeOriginator flag', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        excludeOriginator: true,
      })

      expect(event.excludeOriginator).toBe(true)
    })

    it('sets up user-based shouldSubscribe when user option is true', async () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        user: true,
      })

      expect(event.isProtected).toBe(true)

      // Should return false when client has no userId
      const resultNoUser = await event.shouldSubscribe(
        { userId: null } as any,
        'ev',
        'some-channel',
      )
      expect(resultNoUser).toBe(false)

      // Should return true when channel matches userId
      const resultMatch = await event.shouldSubscribe(
        { userId: '123' } as any,
        'ev',
        '123',
      )
      expect(resultMatch).toBe(true)

      // Should return false when channel does not match userId
      const resultMismatch = await event.shouldSubscribe(
        { userId: '123' } as any,
        'ev',
        '456',
      )
      expect(resultMismatch).toBe(false)
    })

    it('overrides user shouldSubscribe with custom shouldSubscribe', async () => {
      const server = createMockServer()
      const channel = createMockChannel()
      const custom = vi.fn().mockResolvedValue(true)

      const event = new Event('ev', server as any, channel as any, {
        user: true,
        shouldSubscribe: custom,
      })

      // Custom should override user-based logic
      const result = await event.shouldSubscribe(
        { userId: null } as any,
        'ev',
        'chan',
      )
      expect(result).toBe(true)
      expect(custom).toHaveBeenCalled()
    })

    it('default shouldSubscribe returns true', async () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any)

      const result = await event.shouldSubscribe(
        {} as any,
        'ev',
        'chan',
      )
      expect(result).toBe(true)
    })
  })

  describe('handler', () => {
    it('calls channel.propagate with encoded payload', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('my-event', server as any, channel as any)

      event.handler(channel as any, { data: 'test' } as any)

      expect(channel.propagate).toHaveBeenCalledTimes(1)
      const [name, payload, excludeUuid] =
        channel.propagate.mock.calls[0]

      expect(name).toBe('my-event')
      expect(typeof payload).toBe('string')
      expect(excludeUuid).toBeUndefined()

      // Payload should be valid EJSON-stringified
      const parsed = JSON.parse(payload)
      expect(parsed.event).toBe('my-event')
      expect(parsed.channel).toBe('test-channel')
      expect(parsed.params).toEqual({ data: 'test' })
    })

    it('passes excludeUuid when excludeOriginator is true and params has uuid', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        excludeOriginator: true,
      })

      event.handler(channel as any, { uuid: 'client-123', data: 'x' } as any)

      const [, , excludeUuid] = channel.propagate.mock.calls[0]
      expect(excludeUuid).toBe('client-123')
    })

    it('does not exclude when excludeOriginator is false', () => {
      const server = createMockServer()
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        excludeOriginator: false,
      })

      event.handler(channel as any, { uuid: 'client-123' } as any)

      const [, , excludeUuid] = channel.propagate.mock.calls[0]
      expect(excludeUuid).toBeUndefined()
    })

    it('publishes to redis when cluster is true and redis transport available', () => {
      const publishMock = vi.fn().mockResolvedValue(undefined)
      const server = createMockServer({
        redisTransport: {
          pub: true,
          publish: publishMock,
        },
      })
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
      })

      event.handler(channel as any, { data: 'hello' } as any)

      expect(publishMock).toHaveBeenCalledTimes(1)
      expect(publishMock.mock.calls[0][0]).toBe('ev')
      expect(publishMock.mock.calls[0][1]).toBe('test-channel')
      // Third arg is the encoded payload string
      expect(typeof publishMock.mock.calls[0][2]).toBe('string')
      // Fourth arg is excludeUuid
      expect(publishMock.mock.calls[0][3]).toBeUndefined()
      // Should NOT call channel.propagate when using redis
      expect(channel.propagate).not.toHaveBeenCalled()
    })

    it('publishes to redis with excludeUuid when excludeOriginator + cluster', () => {
      const publishMock = vi.fn().mockResolvedValue(undefined)
      const server = createMockServer({
        redisTransport: { pub: true, publish: publishMock },
      })
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
        excludeOriginator: true,
      })

      event.handler(channel as any, { uuid: 'origin-uuid', data: 'x' } as any)

      expect(publishMock.mock.calls[0][3]).toBe('origin-uuid')
      expect(channel.propagate).not.toHaveBeenCalled()
    })

    it('falls through to propagate when cluster is true but no redis pub', () => {
      const server = createMockServer({
        redisTransport: { pub: null },
      })
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
      })

      event.handler(channel as any, { data: 'hello' } as any)

      expect(channel.propagate).toHaveBeenCalledTimes(1)
    })

    it('falls through to propagate when cluster is true but no redisTransport', () => {
      const server = createMockServer({ redisTransport: null })
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
      })

      event.handler(channel as any, { data: 'hello' } as any)

      expect(channel.propagate).toHaveBeenCalledTimes(1)
    })

    it('handles redis publish error gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const publishMock = vi
        .fn()
        .mockRejectedValue(new Error('Redis connection failed'))
      const server = createMockServer({
        redisTransport: { pub: true, publish: publishMock },
      })
      const channel = createMockChannel()

      const event = new Event('ev', server as any, channel as any, {
        cluster: true,
      })

      event.handler(channel as any, { data: 'hello' } as any)

      // Wait for the promise rejection to be caught
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })
})
