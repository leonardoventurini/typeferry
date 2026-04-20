import { describe, expect, it, vi } from 'vitest'

import { getPromise, randomSleep, sleep } from './promise'

describe('getPromise', () => {
  it('returns an object with promise and resolve', () => {
    const { promise, resolve } = getPromise()
    expect(promise).toBeInstanceOf(Promise)
    expect(typeof resolve).toBe('function')
  })

  it('resolves the promise when resolve is called', async () => {
    const { promise, resolve } = getPromise()
    resolve('hello')
    const result = await promise
    expect(result).toBe('hello')
  })
})

describe('sleep', () => {
  it('resolves after the given milliseconds', async () => {
    vi.useFakeTimers()

    const promise = sleep(100)
    vi.advanceTimersByTime(100)

    await promise

    vi.useRealTimers()
  })
})

describe('randomSleep', () => {
  it('resolves after a random delay using defaults', async () => {
    vi.useFakeTimers()

    const promise = randomSleep()
    // Advance past the max default (200ms)
    vi.advanceTimersByTime(200)

    await promise

    vi.useRealTimers()
  })

  it('resolves after a random delay with custom min/max (line 19)', async () => {
    vi.useFakeTimers()

    const promise = randomSleep(10, 20)
    // Advance past the max (20ms)
    vi.advanceTimersByTime(20)

    await promise

    vi.useRealTimers()
  })
})
