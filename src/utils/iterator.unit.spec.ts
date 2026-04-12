import { describe, expect, it } from 'vitest'
import EventEmitter2 from './event-emitter'

import { createIterator } from './iterator'

describe('createIterator', () => {
  describe('next()', () => {
    it('resolves with { value, done: false } when the event fires', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const promise = iterator.next()
      emitter.emit('data', 'hello')

      const result = await promise
      expect(result).toEqual({ value: 'hello', done: false })
    })

    it('resolves with different values for successive calls', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const p1 = iterator.next()
      emitter.emit('data', 'first')
      expect(await p1).toEqual({ value: 'first', done: false })

      const p2 = iterator.next()
      emitter.emit('data', 'second')
      expect(await p2).toEqual({ value: 'second', done: false })
    })

    it('resolves with undefined value when event fires without data', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'ping')

      const promise = iterator.next()
      emitter.emit('ping')

      const result = await promise
      expect(result).toEqual({ value: undefined, done: false })
    })

    it('returns { done: true } immediately after return() is called', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      iterator.return()

      const result = await iterator.next()
      expect(result).toEqual({ done: true })
    })

    it('returns { done: true } immediately after throw() is called', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      try {
        await iterator.throw(new Error('test'))
      } catch {
        // expected
      }

      const result = await iterator.next()
      expect(result).toEqual({ done: true })
    })
  })

  describe('return()', () => {
    it('returns { done: true }', () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const result = iterator.return()
      expect(result).toEqual({ done: true })
    })

    it('sets done to true so subsequent next() calls resolve immediately', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      iterator.return()

      const r1 = await iterator.next()
      const r2 = await iterator.next()

      expect(r1).toEqual({ done: true })
      expect(r2).toEqual({ done: true })
    })
  })

  describe('throw()', () => {
    it('sets done to true', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const error = new Error('test error')

      await expect(iterator.throw(error)).rejects.toThrow('test error')

      const result = await iterator.next()
      expect(result).toEqual({ done: true })
    })

    it('returns a rejected promise with the provided error', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const error = new Error('something went wrong')

      await expect(iterator.throw(error)).rejects.toBe(error)
    })

    it('rejects with non-Error values', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      await expect(iterator.throw('string error')).rejects.toBe('string error')
    })
  })

  describe('[Symbol.asyncIterator]()', () => {
    it('returns the iterator itself', () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      expect(iterator[Symbol.asyncIterator]()).toBe(iterator)
    })

    it('is usable with for-await-of', async () => {
      const emitter = new EventEmitter2()
      const iterator = createIterator(emitter, 'data')

      const values: unknown[] = []

      // Collect values in a separate async task
      const collectPromise = (async () => {
        for await (const value of iterator) {
          values.push(value)
          if (values.length >= 2) break
        }
      })()

      // Allow the for-await-of to call next() and register the once listener
      await new Promise(r => setTimeout(r, 5))
      emitter.emit('data', 1)

      // Allow the loop to process the first value and call next() again
      await new Promise(r => setTimeout(r, 5))
      emitter.emit('data', 2)

      await collectPromise

      expect(values).toEqual([1, 2])
    })
  })
})
