import type {
  ChangeStream,
  ChangeStreamDocument,
  Collection,
  Document,
} from 'mongodb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MongoLiveCollectionSource, readLiveId } from './source'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: Error) => void
}

class FakeStream {
  readonly next = deferred<IteratorResult<ChangeStreamDocument<Document>>>()

  constructor(
    private readonly initial:
      | ChangeStreamDocument<Document>
      | null
      | Error
      | Promise<ChangeStreamDocument<Document> | null>,
  ) {}

  async tryNext(): Promise<ChangeStreamDocument<Document> | null> {
    if (this.initial instanceof Error) throw this.initial
    return this.initial
  }

  async close(): Promise<void> {
    this.next.resolve({ done: true, value: undefined })
  }

  [Symbol.asyncIterator](): AsyncIterator<ChangeStreamDocument<Document>> {
    return {
      next: () => this.next.promise,
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('MongoLiveCollectionSource', () => {
  it('recognizes ObjectIds produced by another bundled BSON constructor', () => {
    const hex = 'a'.repeat(24)
    const bundledObjectId = {
      _bsontype: 'ObjectId',
      toHexString: () => hex,
    }

    const id = readLiveId(bundledObjectId)
    if (!id || typeof id !== 'object') {
      throw new Error('Expected a BSON ObjectId source identifier.')
    }

    expect(id.toHexString()).toBe(hex)
  })

  it('allows a clean retry after initial stream establishment fails', async () => {
    const streams = [
      new FakeStream(new Error('replica unavailable')),
      new FakeStream(null),
    ]
    const source = new MongoLiveCollectionSource(
      createCollection(streams),
    )

    await expect(source.start()).rejects.toThrow('replica unavailable')
    await expect(source.start()).resolves.toBeUndefined()
    await source.close()
  })

  it('does not report ready while a failed stream is reopening', async () => {
    vi.useFakeTimers()
    const reopening = deferred<ChangeStreamDocument<Document> | null>()
    const first = new FakeStream(null)
    const second = new FakeStream(reopening.promise)
    const source = new MongoLiveCollectionSource(
      createCollection([first, second]),
    )
    await source.start()

    first.next.reject(new Error('stream interrupted'))
    await vi.advanceTimersByTimeAsync(1)

    let ready = false
    const starting = source.start().then(() => {
      ready = true
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(ready).toBe(false)

    reopening.resolve(null)
    await starting
    expect(ready).toBe(true)
    await source.close()
  })

  it('isolates listener failures so later listeners still receive notices', async () => {
    const change = {
      _id: { token: 1 },
      operationType: 'insert',
      documentKey: { _id: 'board-1' },
      fullDocument: { _id: 'board-1' },
      ns: { db: 'test', coll: 'boards' },
      clusterTime: { _bsontype: 'Timestamp' },
    } as unknown as ChangeStreamDocument<Document>
    const source = new MongoLiveCollectionSource(
      createCollection([new FakeStream(change)]),
    )
    const received: string[] = []
    source.subscribe(() => {
      throw new Error('listener failed')
    })
    source.subscribe(notice => {
      received.push(notice.type)
    })

    await source.start()
    expect(received).toEqual(['change'])
    await source.close()
  })
})

function createCollection(
  streams: readonly FakeStream[],
): Collection<Document> {
  let index = 0
  return {
    watch: () => {
      const stream = streams[index]
      index += 1
      if (!stream) throw new Error('unexpected stream open')
      return stream as unknown as ChangeStream<Document>
    },
  } as unknown as Collection<Document>
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null
  let rejectPromise: ((error: Error) => void) | null = null
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: value => resolvePromise?.(value),
    reject: error => rejectPromise?.(error),
  }
}
