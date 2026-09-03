import type {
  ChangeStream,
  ChangeStreamDocument,
  Collection,
  Document,
} from 'mongodb'

import {
  MONGO_LIVE_SOURCE_RETRY_MS,
  type MongoLiveSourceId,
} from './types'

/** Normalized collection change consumed by live observers. */
export type MongoLiveSourceNotice =
  | {
      readonly type: 'change'
      readonly sequence: number
      readonly id: MongoLiveSourceId
      readonly deleted: boolean
    }
  | {
      readonly type: 'reset'
      readonly sequence: number
      readonly reason: 'invalidated' | 'resume-failed'
    }

/** Listener registered by one live observer. */
export type MongoLiveSourceListener = (
  notice: MongoLiveSourceNotice,
) => void | Promise<void>

/** Change-source contract used by observers and deterministic tests. */
export interface MongoLiveChangeSource {
  /** Waits until the collection change stream is established. */
  start(): Promise<void>
  /** Registers an ordered notice listener. */
  subscribe(listener: MongoLiveSourceListener): () => void
  /** Closes the source and waits for its worker to finish. */
  close(): Promise<void>
}

/** One resumable MongoDB change stream shared by a collection. */
export class MongoLiveCollectionSource implements MongoLiveChangeSource {
  private readonly listeners = new Set<MongoLiveSourceListener>()
  private stream: ChangeStream<Document> | null = null
  private worker: Promise<void> | null = null
  private starting: Promise<void> | null = null
  private closed = false
  private ready = false
  private readiness = createDeferred()
  private sequence = 0
  private resumeToken: Document | null = null

  /** Creates a source for one native MongoDB collection. */
  constructor(private readonly collection: Collection<Document>) {}

  /** Establishes the stream before subscriptions are allowed to snapshot. */
  async start(): Promise<void> {
    if (this.closed) {
      throw new Error('MongoDB live change source is closed.')
    }
    if (this.ready) return
    if (this.worker) {
      await this.readiness.promise
      if (this.closed || !this.ready) {
        throw new Error('MongoDB live change source is closed.')
      }
      return
    }
    if (!this.starting) {
      this.starting = this.establishInitial().finally(() => {
        this.starting = null
      })
    }
    await this.starting
  }

  /** Registers a listener and returns idempotent removal. */
  subscribe(listener: MongoLiveSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Stops the stream and drains the active worker. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.readiness.resolve()
    await this.stream?.close().catch(() => undefined)
    await this.starting?.catch(() => undefined)
    await this.worker?.catch(() => undefined)
    this.listeners.clear()
  }

  private openStream(): ChangeStream<Document> {
    return this.collection.watch([], {
      fullDocument: 'updateLookup',
      maxAwaitTimeMS: 100,
      ...(this.resumeToken ? { resumeAfter: this.resumeToken } : {}),
    })
  }

  private async establishInitial(): Promise<void> {
    try {
      this.stream = this.openStream()
      const first = await this.stream.tryNext()
      if (first) await this.dispatchChange(first)
      if (this.closed) {
        throw new Error('MongoDB live change source is closed.')
      }
      this.markReady()
      this.worker = this.consume()
    } catch (error) {
      await this.stream?.close().catch(() => undefined)
      this.stream = null
      throw error
    }
  }

  private async consume(): Promise<void> {
    while (!this.closed) {
      try {
        if (!this.stream) this.stream = this.openStream()
        for await (const change of this.stream) {
          if (this.closed) return
          await this.dispatchChange(change)
        }
        if (!this.closed) {
          await this.resetAndReopen('resume-failed')
        }
      } catch {
        if (this.closed) return
        await this.resetAndReopen('resume-failed')
      }
    }
  }

  private async resetAndReopen(
    reason: 'invalidated' | 'resume-failed',
  ): Promise<void> {
    this.markUnavailable()
    await this.stream?.close().catch(() => undefined)
    this.stream = null
    await this.dispatch({ type: 'reset', sequence: ++this.sequence, reason })
    while (!this.closed && !this.ready) {
      await delay(MONGO_LIVE_SOURCE_RETRY_MS)
      try {
        this.stream = this.openStream()
        const first = await this.stream.tryNext()
        if (first) await this.dispatchChange(first)
        this.markReady()
      } catch {
        await this.stream?.close().catch(() => undefined)
        this.resumeToken = null
        this.stream = null
      }
    }
  }

  private async dispatchChange(
    change: ChangeStreamDocument<Document>,
  ): Promise<void> {
    this.resumeToken = change._id

    if (change.operationType === 'invalidate') {
      this.markUnavailable()
      await this.dispatch({
        type: 'reset',
        sequence: ++this.sequence,
        reason: 'invalidated',
      })
      return
    }

    if (!('documentKey' in change)) return
    const id = readLiveId(change.documentKey?._id)
    if (id === null) return

    await this.dispatch({
      type: 'change',
      sequence: ++this.sequence,
      id,
      deleted: change.operationType === 'delete',
    })
  }

  private async dispatch(notice: MongoLiveSourceNotice): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(notice)
      } catch {
        // One observer must not interrupt the shared collection source.
      }
    }
  }

  private markUnavailable(): void {
    if (!this.ready) return
    this.ready = false
    this.readiness = createDeferred()
  }

  private markReady(): void {
    if (this.ready) return
    this.ready = true
    this.readiness.resolve()
  }
}

/** Validates a MongoDB source identifier for EJSON client materialization. */
export function readLiveId(value: unknown): MongoLiveSourceId | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (
    value &&
    typeof value === 'object' &&
    (value as { readonly _bsontype?: unknown })._bsontype === 'ObjectId' &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return value as MongoLiveSourceId
  }
  return null
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

interface Deferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | null = null
  const promise = new Promise<void>(resolve => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: () => resolvePromise?.(),
  }
}
