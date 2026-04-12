import { describe, expect, it, vi } from 'vitest'

import EventEmitter2 from './event-emitter'

describe('EventEmitter2', () => {
  it('collapses single listeners into _events entries and expands on demand', () => {
    const emitter = new EventEmitter2()
    const first = vi.fn()
    const second = vi.fn()

    emitter.on('ping', first)
    expect(emitter._events.ping).to.equal(first)

    emitter.on('ping', second)
    expect(emitter._events.ping).to.deep.equal([first, second])

    emitter.off('ping', second)
    expect(emitter._events.ping).to.equal(first)
  })

  it('removes once listeners when off receives the original callback', () => {
    const emitter = new EventEmitter2()
    const listener = vi.fn()

    emitter.once('ping', listener)
    emitter.off('ping', listener)
    emitter.emit('ping', 1)

    expect(listener).not.toHaveBeenCalled()
    expect(emitter.listenerCount('ping')).to.equal(0)
  })

  it('cleans waitFor listeners after resolve and timeout', async () => {
    const emitter = new EventEmitter2()

    const resolved = emitter.waitFor('ready', 100)
    expect(emitter.listenerCount('ready')).to.equal(1)

    emitter.emit('ready', 'ok')
    await expect(resolved).resolves.to.deep.equal(['ok'])
    expect(emitter.listenerCount('ready')).to.equal(0)

    const timedOut = emitter.waitFor('late', 10)
    expect(emitter.listenerCount('late')).to.equal(1)

    await expect(timedOut).rejects.toThrow('Timed out waiting for "late"')
    expect(emitter.listenerCount('late')).to.equal(0)
  })

  it('clears any-listeners on removeAllListeners to prevent leak accumulation', () => {
    const emitter = new EventEmitter2()
    const listener = vi.fn()

    emitter.onAny(listener)
    emitter.removeAllListeners()
    emitter.emit('ping', 1)

    expect(listener).not.toHaveBeenCalled()
  })

  it('dispatches specific and any listeners with stable snapshots', () => {
    const emitter = new EventEmitter2()
    const events: string[] = []

    emitter.on('ping', () => {
      events.push('specific')
      emitter.off('ping', second)
    })
    const second = () => {
      events.push('second')
    }
    emitter.on('ping', second)
    emitter.onAny(event => {
      events.push(`any:${event}`)
    })

    emitter.emit('ping')

    expect(events).to.deep.equal(['specific', 'second', 'any:ping'])
  })
})
