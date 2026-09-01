import type { Collection, Document, Filter, Sort } from 'mongodb'

import { EJSON } from '../../ejson'
import type {
  MongoLiveChangeSource,
  MongoLiveSourceNotice,
} from './source'
import type {
  MongoLiveClientDocument,
  MongoLiveDelta,
  MongoLiveId,
  MongoLiveOperation,
  MongoLiveProjectedFields,
  MongoLiveSnapshot,
  MongoLiveRuntimeWindow,
} from './types'
import { readLiveId } from './source'
import { createMongoLiveWindowSplice } from './window'

const MAX_HANDOFF_NOTICES = 10_000

/** Options required to maintain one authoritative connection-owned result set. */
export interface MongoLiveObserverOptions {
  /** Stable client subscription identifier. */
  readonly subscriptionId: string
  /** New generation allocated for this observer incarnation. */
  readonly generation: string
  /** Native collection queried for snapshots and membership checks. */
  readonly collection: Collection<Document>
  /** Server-owned MongoDB filter. */
  readonly filter: Filter<Document>
  /** Optional stable bounded ordering contract. */
  readonly window?: MongoLiveRuntimeWindow | null
  /** Whether ObjectIds use the collision-proof discriminated wire form. */
  readonly typedObjectIds?: boolean
  /** Server-owned projection. */
  readonly project: (
    document: Document,
  ) => Promise<MongoLiveProjectedFields>
  /** Shared ordered collection change source. */
  readonly source: MongoLiveChangeSource
  /** Maximum accepted initial snapshot size. */
  readonly maxSnapshotDocuments: number
  /** Sends an ordered delta to the owning connection. */
  readonly onDelta: (delta: MongoLiveDelta) => void
  /** Marks the owning connection stale after source discontinuity. */
  readonly onStale: () => void
}

/** Maintains query membership and emits semantic document operations. */
export class MongoLiveObserver {
  private readonly documents = new Map<string, MongoLiveClientDocument>()
  private orderedDocuments: readonly MongoLiveClientDocument[] = []
  private readonly bufferedNotices: MongoLiveSourceNotice[] = []
  private unsubscribeSource: (() => void) | null = null
  private initializing = true
  private initializationInvalidated = false
  private stopped = false
  private sequence = 0
  private work: Promise<void> = Promise.resolve()
  private orderedRefreshRunning = false
  private orderedRefreshPending = false

  /** Creates one connection-private observer. */
  constructor(private readonly options: MongoLiveObserverOptions) {}

  /** Builds an atomic snapshot and starts ordered delta delivery. */
  async start(): Promise<MongoLiveSnapshot> {
    this.unsubscribeSource = this.options.source.subscribe(notice => {
      if (this.initializing) {
        if (notice.type === 'reset') {
          this.initializationInvalidated = true
          return
        }
        if (this.bufferedNotices.length >= MAX_HANDOFF_NOTICES) {
          this.initializationInvalidated = true
          return
        }
        this.bufferedNotices.push(notice)
        return
      }
      if (notice.type === 'reset') {
        this.options.onStale()
        void this.stop()
        return
      }
      if (this.options.window) {
        this.enqueueOrderedRefresh()
        return
      }
      this.enqueue(notice)
    })

    const snapshotDocuments = await this.readSnapshotDocuments()
    this.assertInitializationValid()

    if (
      !this.options.window &&
      snapshotDocuments.length > this.options.maxSnapshotDocuments
    ) {
      await this.stop()
      throw new Error(
        `MongoDB live snapshot exceeds ${this.options.maxSnapshotDocuments} documents.`,
      )
    }

    const projectedDocuments: MongoLiveClientDocument[] = []
    for (const document of snapshotDocuments) {
      const projected = await this.project(document)
      this.assertInitializationValid()
      projectedDocuments.push(projected)
    }
    if (this.options.window) {
      this.orderedDocuments = projectedDocuments
    } else {
      for (const projected of projectedDocuments) {
        this.documents.set(canonicalId(projected._id), projected)
      }
    }

    while (this.bufferedNotices.length > 0) {
      this.assertInitializationValid()
      const notices = this.bufferedNotices.splice(0)
      for (const notice of notices) {
        await this.applyNotice(notice, false)
        this.assertInitializationValid()
      }
    }

    this.assertInitializationValid()
    this.initializing = false

    return {
      subscriptionId: this.options.subscriptionId,
      generation: this.options.generation,
      sequence: this.sequence,
      ordered: Boolean(this.options.window),
      documents: this.options.window
        ? this.orderedDocuments
        : [...this.documents.values()],
    }
  }

  /** Stops source delivery and drains membership work. */
  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.unsubscribeSource?.()
    this.unsubscribeSource = null
    await this.work.catch(() => undefined)
    this.bufferedNotices.length = 0
  }

  private enqueue(notice: MongoLiveSourceNotice): void {
    this.work = this.work
      .then(() => this.applyNotice(notice, true))
      .catch(() => {
        if (!this.stopped) this.options.onStale()
      })
  }

  private enqueueOrderedRefresh(): void {
    if (this.orderedRefreshRunning) {
      this.orderedRefreshPending = true
      return
    }
    this.orderedRefreshRunning = true
    this.work = this.work
      .then(async () => {
        do {
          this.orderedRefreshPending = false
          await this.refreshOrderedWindow(true)
        } while (this.orderedRefreshPending && !this.stopped)
      })
      .catch(() => {
        if (!this.stopped) this.options.onStale()
      })
      .finally(() => {
        this.orderedRefreshRunning = false
        this.orderedRefreshPending = false
      })
  }

  private assertInitializationValid(): void {
    if (!this.initializationInvalidated) return
    void this.stop()
    throw new Error(
      'MongoDB live source reset while the initial snapshot was being built.',
    )
  }

  private async applyNotice(
    notice: MongoLiveSourceNotice,
    emit: boolean,
  ): Promise<void> {
    if (this.stopped) return
    if (notice.type === 'reset') {
      if (emit) this.options.onStale()
      return
    }
    if (this.options.window) {
      await this.refreshOrderedWindow(emit)
      return
    }

    const clientId = toClientId(notice.id, this.options.typedObjectIds ?? false)
    const key = canonicalId(clientId)
    const previous = this.documents.get(key)
    let operation: MongoLiveOperation | null = null

    if (notice.deleted) {
      if (previous) {
        this.documents.delete(key)
        operation = { type: 'removed', id: clientId }
      }
    } else {
      const current = await this.options.collection.findOne(
        {
          $and: [
            this.options.filter,
            { _id: notice.id } as Filter<Document>,
          ],
        } as Filter<Document>,
        { readConcern: { level: 'majority' } },
      )

      if (!current && previous) {
        this.documents.delete(key)
        operation = { type: 'removed', id: clientId }
      } else if (current) {
        const projected = await this.project(current)
        this.documents.set(key, projected)
        if (!previous) {
          operation = { type: 'added', document: projected }
        } else if (!EJSON.equals(previous, projected)) {
          operation = { type: 'changed', document: projected }
        }
      }
    }

    if (!operation || !emit) return
    this.options.onDelta({
      type: 'delta',
      subscriptionId: this.options.subscriptionId,
      generation: this.options.generation,
      sequence: ++this.sequence,
      operations: [operation],
    })
  }

  private async readSnapshotDocuments(): Promise<Document[]> {
    let cursor = this.options.collection.find(this.options.filter, {
      readConcern: { level: 'majority' },
    })
    if (this.options.window) {
      cursor = cursor
        .sort(this.options.window.sort as Sort)
        .skip(this.options.window.skip)
        .limit(this.options.window.limit)
    } else {
      cursor = cursor.limit(this.options.maxSnapshotDocuments + 1)
    }
    return cursor.toArray()
  }

  private async refreshOrderedWindow(emit: boolean): Promise<void> {
    const storedDocuments = await this.readSnapshotDocuments()
    const current: MongoLiveClientDocument[] = []
    for (const document of storedDocuments) {
      current.push(await this.project(document))
    }
    if (this.stopped) return
    const operation = createMongoLiveWindowSplice(
      this.orderedDocuments,
      current,
    )
    this.orderedDocuments = current
    if (!operation || !emit) return
    this.options.onDelta({
      type: 'delta',
      subscriptionId: this.options.subscriptionId,
      generation: this.options.generation,
      sequence: ++this.sequence,
      operations: [operation],
    })
  }

  private async project(
    document: Document,
  ): Promise<MongoLiveClientDocument> {
    const sourceId = readLiveId(document._id)
    if (sourceId === null) {
      throw new Error(
        'MongoDB live publications require ObjectId, string, or number "_id".',
      )
    }
    const fields = await this.options.project(document)
    if ('_id' in fields) {
      throw new Error('MongoDB live projectors must not return "_id".')
    }
    return Object.assign(
      { _id: toClientId(sourceId, this.options.typedObjectIds ?? false) },
      fields,
    ) as unknown as MongoLiveClientDocument
  }
}

function toClientId(
  id: import('./types').MongoLiveSourceId,
  typedObjectIds: boolean,
): MongoLiveId {
  if (typeof id !== 'object') return id
  return typedObjectIds ? { $objectId: id.toHexString() } : id.toHexString()
}

/** Creates a stable type-tagged EJSON identity key. */
export function canonicalId(id: MongoLiveId): string {
  return EJSON.stringify(id, { canonical: true })
}
