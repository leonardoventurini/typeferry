import type EventEmitter2 from './event-emitter'

export function createIterator(
  emitter: EventEmitter2,
  event: string,
): EventAsyncIterator {
  let done = false

  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next(): Promise<IteratorResult<unknown>> {
      return new Promise<IteratorResult<unknown>>(resolve => {
        if (done) {
          resolve({ done: true, value: undefined })
          return
        }

        emitter.once(event, (value: unknown) => {
          resolve({ value, done: false })
        })
      })
    },
    async return(): Promise<IteratorResult<unknown>> {
      done = true
      return { done: true, value: undefined }
    },
    throw(error: unknown): Promise<IteratorResult<unknown>> {
      done = true
      return Promise.reject(error)
    },
  }
}

/** Async event iterator with the cleanup methods guaranteed by this implementation. */
export interface EventAsyncIterator extends AsyncIterableIterator<unknown> {
  return(): Promise<IteratorResult<unknown>>
  throw(error: unknown): Promise<IteratorResult<unknown>>
}
