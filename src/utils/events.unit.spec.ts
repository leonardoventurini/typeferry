import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter2 } from 'eventemitter2'

import { onAllThrottled, onceAll, waitForAll } from './events'

describe('onceAll', () => {
  it('resolves when all events have fired', async () => {
    const emitter = new EventEmitter2()
    const promise = onceAll(emitter, ['a', 'b', 'c'])

    emitter.emit('a')
    emitter.emit('b')
    emitter.emit('c')

    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves even if events fire in different order', async () => {
    const emitter = new EventEmitter2()
    const promise = onceAll(emitter, ['x', 'y'])

    emitter.emit('y')
    emitter.emit('x')

    await expect(promise).resolves.toBeUndefined()
  })

  it('does not resolve until all events fire', async () => {
    const emitter = new EventEmitter2()
    let resolved = false

    const promise = onceAll(emitter, ['a', 'b']).then(() => {
      resolved = true
    })

    emitter.emit('a')

    // Give microtasks a chance to flush
    await Promise.resolve()
    expect(resolved).toBe(false)

    emitter.emit('b')
    await promise

    expect(resolved).toBe(true)
  })

  it('resolves immediately for an empty events array', async () => {
    const emitter = new EventEmitter2()
    await expect(onceAll(emitter, [])).resolves.toBeUndefined()
  })

  it('resolves with a single event', async () => {
    const emitter = new EventEmitter2()
    const promise = onceAll(emitter, ['only'])

    emitter.emit('only')

    await expect(promise).resolves.toBeUndefined()
  })
})

describe('waitForAll', () => {
  it('resolves when all events fire within timeout', async () => {
    const emitter = new EventEmitter2()
    const promise = waitForAll(emitter, ['a', 'b'], 5000)

    emitter.emit('a')
    emitter.emit('b')

    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves for an empty events array', async () => {
    const emitter = new EventEmitter2()
    await expect(waitForAll(emitter, [], 1000)).resolves.toBeUndefined()
  })

  it('rejects when an event does not fire within timeout', async () => {
    const emitter = new EventEmitter2()

    await expect(waitForAll(emitter, ['never'], 50)).rejects.toThrow()
  })
})

describe('onAllThrottled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls the callback when any registered event fires', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    onAllThrottled(emitter, ['a', 'b'], callback, 100)

    emitter.emit('a')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('throttles rapid event emissions', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    onAllThrottled(emitter, ['a'], callback, 100)

    emitter.emit('a')
    emitter.emit('a')
    emitter.emit('a')

    // Leading call fires immediately, rest are throttled
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('fires trailing call after throttle period', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    onAllThrottled(emitter, ['a'], callback, 100)

    emitter.emit('a')
    emitter.emit('a')

    vi.advanceTimersByTime(100)

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('returns a cleanup function that removes listeners', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    const cleanup = onAllThrottled(emitter, ['a', 'b'], callback, 100)

    cleanup()

    emitter.emit('a')
    emitter.emit('b')

    expect(callback).not.toHaveBeenCalled()
  })

  it('registers the same throttled handler on all events', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    onAllThrottled(emitter, ['a', 'b', 'c'], callback, 100)

    emitter.emit('a')
    expect(callback).toHaveBeenCalledTimes(1)

    // These are throttled because same handler
    emitter.emit('b')
    emitter.emit('c')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('supports custom throttle options', () => {
    const emitter = new EventEmitter2()
    const callback = vi.fn()

    onAllThrottled(emitter, ['a'], callback, 100, { leading: false })

    emitter.emit('a')
    // With leading:false, callback should not fire immediately
    expect(callback).not.toHaveBeenCalled()
  })
})
