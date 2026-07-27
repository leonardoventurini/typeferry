import type { Collection, Document, Filter } from 'mongodb'

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
} from './types'
import { readLiveId } from './source'

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
  private readonly bufferedNotices: MongoLiveSourceNotice[] = []
  private unsubscribeSource: (() => void) | null = null
  private initializing = true
  private initializationInvalidated = false
  private stopped = false
  private sequence = 0
  private work: Promise<void> = Promise.resolve()

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
      this.enqueue(notice)
    })

    const snapshotDocuments = await this.options.collection
      .find(this.options.filter, { readConcern: { level: 'majority' } })
      .limit(this.options.maxSnapshotDocuments + 1)
      .toArray()
    this.assertInitializationValid()

    if (snapshotDocuments.length > this.options.maxSnapshotDocuments) {
      await this.stop()
      throw new Error(
        `MongoDB live snapshot exceeds ${this.options.maxSnapshotDocuments} documents.`,
      )
    }

    for (const document of snapshotDocuments) {
      const projected = await this.project(document)
      this.assertInitializationValid()
      this.documents.set(canonicalId(projected._id), projected)
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
      documents: [...this.documents.values()],
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

    const clientId = toClientId(notice.id)
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
      { _id: toClientId(sourceId) },
      fields,
    ) as unknown as MongoLiveClientDocument
  }
}

function toClientId(
  id: import('./types').MongoLiveSourceId,
): MongoLiveId {
  return typeof id === 'object' ? id.toHexString() : id
}

/** Creates a stable type-tagged EJSON identity key. */
export function canonicalId(id: MongoLiveId): string {
  return EJSON.stringify(id, { canonical: true })
}
