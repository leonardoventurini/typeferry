import { ObjectId, type Collection, type Document } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { MongoLiveObserver } from './observer'
import type {
  MongoLiveChangeSource,
  MongoLiveSourceListener,
  MongoLiveSourceNotice,
} from './source'
import type { MongoLiveDelta, MongoLiveId } from './types'
import { applyMongoLiveWindowSplice } from './window'

interface Board extends Document {
  _id: ObjectId
  owner: string
  name: string
  score?: number
}

class FakeSource implements MongoLiveChangeSource {
  private readonly listeners = new Set<MongoLiveSourceListener>()

  async start(): Promise<void> {}

  subscribe(listener: MongoLiveSourceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async emit(notice: MongoLiveSourceNotice): Promise<void> {
    for (const listener of this.listeners) await listener(notice)
  }

  async close(): Promise<void> {
    this.listeners.clear()
  }
}

function createCollection(documents: Map<string, Board>): Collection<Document> {
  const cursor = {
    limit: () => cursor,
    toArray: async () =>
      [...documents.values()].map(document => ({ ...document })),
  }
  return {
    find: () => cursor,
    findOne: async (filter: {
      $and?: readonly [Document, { _id?: ObjectId }]
    }) => {
      const id = filter.$and?.[1]._id
      if (!id) return null
      const document = documents.get(id.toHexString())
      if (!document) return null
      const owner = filter.$and?.[0].owner
      return !owner || document.owner === owner ? { ...document } : null
    },
  } as unknown as Collection<Document>
}

function createOrderedCollection(
  documents: Map<string, Board>,
  beforeRead?: () => void | Promise<void>,
): Collection<Document> {
  return {
    find: (filter: Document) => {
      let skip = 0
      let limit = Number.MAX_SAFE_INTEGER
      const cursor = {
        sort: () => cursor,
        skip: (value: number) => {
          skip = value
          return cursor
        },
        limit: (value: number) => {
          limit = value
          return cursor
        },
        toArray: async () => {
          await beforeRead?.()
          return [...documents.values()]
            .filter(document => !filter.owner || document.owner === filter.owner)
            .sort(
              (left, right) =>
                (left.score ?? 0) - (right.score ?? 0) ||
                left._id.toHexString().localeCompare(right._id.toHexString()),
            )
            .slice(skip, skip + limit)
            .map(document => ({ ...document }))
        },
      }
      return cursor
    },
  } as unknown as Collection<Document>
}

describe('MongoLiveObserver', () => {
  it('closes the snapshot/change race by replaying buffered identifiers', async () => {
    const first = new ObjectId()
    const inserted = new ObjectId()
    const documents = new Map<string, Board>([
      [
        first.toHexString(),
        { _id: first, owner: 'owner-1', name: 'Initial' },
      ],
    ])
    const source = new FakeSource()
    let releaseProjection: (() => void) | null = null
    const projectionGate = new Promise<void>(resolve => {
      releaseProjection = resolve
    })

    const observer = new MongoLiveObserver({
      subscriptionId: 'sub-1',
      generation: 'generation-1',
      collection: createCollection(documents),
      filter: { owner: 'owner-1' },
      project: async document => {
        if (document._id.toHexString() === first.toHexString()) {
          await projectionGate
        }
        return { name: document.name }
      },
      source,
      maxSnapshotDocuments: 10,
      onDelta: () => undefined,
      onStale: () => undefined,
    })

    const starting = observer.start()
    await Promise.resolve()
    documents.set(inserted.toHexString(), {
      _id: inserted,
      owner: 'owner-1',
      name: 'Inserted during snapshot',
    })
    await source.emit({
      type: 'change',
      sequence: 1,
      id: inserted,
      deleted: false,
    })
    releaseProjection?.()

    const snapshot = await starting
    expect(
      snapshot.documents
        .map(
          document =>
            (document as unknown as { readonly name: string }).name,
        )
        .sort(),
    ).toEqual(['Initial', 'Inserted during snapshot'])
    await observer.stop()
  })

  it('rejects a snapshot invalidated by a source reset during projection', async () => {
    const id = new ObjectId()
    const documents = new Map<string, Board>([
      [
        id.toHexString(),
        { _id: id, owner: 'owner-1', name: 'Initial' },
      ],
    ])
    const source = new FakeSource()
    let releaseProjection: (() => void) | null = null
    const projectionGate = new Promise<void>(resolve => {
      releaseProjection = resolve
    })
    const observer = new MongoLiveObserver({
      subscriptionId: 'sub-reset',
      generation: 'generation-reset',
      collection: createCollection(documents),
      filter: { owner: 'owner-1' },
      project: async document => {
        await projectionGate
        return { name: document.name }
      },
      source,
      maxSnapshotDocuments: 10,
      onDelta: () => undefined,
      onStale: () => undefined,
    })

    const starting = observer.start()
    await Promise.resolve()
    await source.emit({
      type: 'reset',
      sequence: 1,
      reason: 'resume-failed',
    })
    releaseProjection?.()

    await expect(starting).rejects.toThrow(
      'source reset while the initial snapshot was being built',
    )
    await observer.stop()
  })

  it('emits added, changed, and removed membership transitions', async () => {
    const id = new ObjectId()
    const documents = new Map<string, Board>()
    const source = new FakeSource()
    const deltas: MongoLiveDelta[] = []
    const observer = new MongoLiveObserver({
      subscriptionId: 'sub-1',
      generation: 'generation-1',
      collection: createCollection(documents),
      filter: { owner: 'owner-1' },
      project: async document => ({ name: document.name }),
      source,
      maxSnapshotDocuments: 10,
      onDelta: delta => deltas.push(delta),
      onStale: () => undefined,
    })
    await observer.start()

    documents.set(id.toHexString(), {
      _id: id,
      owner: 'owner-1',
      name: 'Roadmap',
    })
    await source.emit({ type: 'change', sequence: 1, id, deleted: false })
    await waitFor(() => deltas.length === 1)

    documents.set(id.toHexString(), {
      _id: id,
      owner: 'owner-1',
      name: 'Roadmap 2',
    })
    await source.emit({ type: 'change', sequence: 2, id, deleted: false })
    await waitFor(() => deltas.length === 2)

    documents.set(id.toHexString(), {
      _id: id,
      owner: 'owner-2',
      name: 'Roadmap 2',
    })
    await source.emit({ type: 'change', sequence: 3, id, deleted: false })
    await waitFor(() => deltas.length === 3)

    expect(deltas.map(delta => delta.operations[0].type)).toEqual([
      'added',
      'changed',
      'removed',
    ])
    expect(deltas.map(delta => delta.sequence)).toEqual([1, 2, 3])
    await observer.stop()
  })

  it('recomputes exact ordered boundaries after outside and inside changes', async () => {
    const ids = Array.from({ length: 7 }, (_, index) =>
      new ObjectId((index + 1).toString(16).padStart(24, '0')),
    )
    const documents = new Map<string, Board>(
      ids.slice(0, 6).map((id, index) => [
        id.toHexString(),
        {
          _id: id,
          owner: 'owner-1',
          name: String.fromCharCode(65 + index),
          score: (index + 1) * 10,
        },
      ]),
    )
    const source = new FakeSource()
    const deltas: MongoLiveDelta[] = []
    const observer = new MongoLiveObserver({
      subscriptionId: 'ordered-1',
      generation: 'generation-1',
      collection: createOrderedCollection(documents),
      filter: { owner: 'owner-1' },
      window: {
        sort: [
          ['score', 1],
          ['_id', 1],
        ],
        skip: 2,
        limit: 3,
      },
      typedObjectIds: true,
      project: async document => ({
        name: document.name,
        score: document.score,
      }),
      source,
      maxSnapshotDocuments: 10,
      onDelta: delta => deltas.push(delta),
      onStale: () => undefined,
    })

    const snapshot = await observer.start()
    expect(snapshot.ordered).toBe(true)
    expect(readNames(snapshot.documents)).toEqual([
      'C',
      'D',
      'E',
    ])
    let clientDocuments = [...snapshot.documents]

    documents.set(ids[6].toHexString(), {
      _id: ids[6],
      owner: 'owner-1',
      name: 'X',
      score: 5,
    })
    await source.emit({
      type: 'change',
      sequence: 1,
      id: ids[6],
      deleted: false,
    })
    await waitFor(() => deltas.length === 1)
    const inserted = deltas[0].operations[0]
    expect(inserted.type).toBe('window-splice')
    if (inserted.type === 'window-splice') {
      clientDocuments = [
        ...(applyMongoLiveWindowSplice(clientDocuments, inserted) ?? []),
      ]
    }
    expect(readNames(clientDocuments)).toEqual([
      'B',
      'C',
      'D',
    ])

    documents.delete(ids[3].toHexString())
    await source.emit({
      type: 'change',
      sequence: 2,
      id: ids[3],
      deleted: true,
    })
    await waitFor(() => deltas.length === 2)
    const targetedDeleteWithoutBoundaryRefill = clientDocuments.filter(
      document =>
        !(
          typeof document._id === 'object' &&
          document._id.$objectId === ids[3].toHexString()
        ),
    )
    expect(readNames(targetedDeleteWithoutBoundaryRefill)).not.toEqual([
      'B',
      'C',
      'E',
    ])
    const removed = deltas[1].operations[0]
    if (removed.type === 'window-splice') {
      clientDocuments = [
        ...(applyMongoLiveWindowSplice(clientDocuments, removed) ?? []),
      ]
    }
    expect(readNames(clientDocuments)).toEqual([
      'B',
      'C',
      'E',
    ])
    await observer.stop()
  })

  it('coalesces a write burst to one running and one dirty refresh', async () => {
    const ids = Array.from({ length: 4 }, (_, index) =>
      new ObjectId((index + 20).toString(16).padStart(24, '0')),
    )
    const documents = new Map<string, Board>(
      ids.slice(0, 3).map((id, index) => [
        id.toHexString(),
        {
          _id: id,
          owner: 'owner-1',
          name: String.fromCharCode(65 + index),
          score: (index + 1) * 10,
        },
      ]),
    )
    let reads = 0
    let blockReads = false
    let releaseRead: (() => void) | null = null
    let signalRead: (() => void) | null = null
    const readGate = new Promise<void>(resolve => {
      releaseRead = resolve
    })
    const readStarted = new Promise<void>(resolve => {
      signalRead = resolve
    })
    const source = new FakeSource()
    const observer = new MongoLiveObserver({
      subscriptionId: 'ordered-burst',
      generation: 'generation-1',
      collection: createOrderedCollection(documents, async () => {
        reads += 1
        if (blockReads) {
          signalRead?.()
          await readGate
        }
      }),
      filter: { owner: 'owner-1' },
      window: {
        sort: [
          ['score', 1],
          ['_id', 1],
        ],
        skip: 0,
        limit: 3,
      },
      typedObjectIds: true,
      project: async document => ({
        name: document.name,
        score: document.score,
      }),
      source,
      maxSnapshotDocuments: 10,
      onDelta: () => undefined,
      onStale: () => undefined,
    })
    await observer.start()
    blockReads = true
    documents.set(ids[3].toHexString(), {
      _id: ids[3],
      owner: 'owner-1',
      name: 'X',
      score: 5,
    })

    await source.emit({
      type: 'change',
      sequence: 1,
      id: ids[3],
      deleted: false,
    })
    await readStarted
    for (let sequence = 2; sequence <= 20; sequence++) {
      await source.emit({
        type: 'change',
        sequence,
        id: ids[3],
        deleted: false,
      })
    }
    blockReads = false
    releaseRead?.()
    await waitFor(() => reads >= 3)
    await new Promise(resolve => setTimeout(resolve, 5))

    expect(reads).toBe(3)
    await observer.stop()
  })

  it('prioritizes source reset over a running ordered refresh', async () => {
    const id = new ObjectId('000000000000000000000099')
    const documents = new Map<string, Board>([
      [
        id.toHexString(),
        {
          _id: id,
          owner: 'owner-1',
          name: 'A',
          score: 10,
        },
      ],
    ])
    let blockReads = false
    let releaseRead: (() => void) | null = null
    let signalRead: (() => void) | null = null
    const readGate = new Promise<void>(resolve => {
      releaseRead = resolve
    })
    const readStarted = new Promise<void>(resolve => {
      signalRead = resolve
    })
    let staleCount = 0
    const source = new FakeSource()
    const observer = new MongoLiveObserver({
      subscriptionId: 'ordered-reset',
      generation: 'generation-1',
      collection: createOrderedCollection(documents, async () => {
        if (blockReads) {
          signalRead?.()
          await readGate
        }
      }),
      filter: { owner: 'owner-1' },
      window: {
        sort: [
          ['score', 1],
          ['_id', 1],
        ],
        skip: 0,
        limit: 1,
      },
      typedObjectIds: true,
      project: async document => ({ name: document.name }),
      source,
      maxSnapshotDocuments: 10,
      onDelta: () => undefined,
      onStale: () => {
        staleCount += 1
      },
    })
    await observer.start()
    blockReads = true
    await source.emit({ type: 'change', sequence: 1, id, deleted: false })
    await readStarted

    await source.emit({
      type: 'reset',
      sequence: 2,
      reason: 'resume-failed',
    })
    expect(staleCount).toBe(1)

    blockReads = false
    releaseRead?.()
    await observer.stop()
  })
})

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('timed out waiting for observer')
}

function readNames(
  documents: readonly { readonly _id: MongoLiveId }[],
): string[] {
  return documents.map(
    document => (document as typeof document & { readonly name: string }).name,
  )
}
