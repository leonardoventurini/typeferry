import { ObjectId, type Collection, type Document } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { MongoLiveObserver } from './observer'
import type {
  MongoLiveChangeSource,
  MongoLiveSourceListener,
  MongoLiveSourceNotice,
} from './source'
import type { MongoLiveDelta } from './types'

interface Board extends Document {
  _id: ObjectId
  owner: string
  name: string
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
})

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('timed out waiting for observer')
}
