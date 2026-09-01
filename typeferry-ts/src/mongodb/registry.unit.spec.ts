import type { Collection, Db, Document, MongoClient } from 'mongodb'
import { ObjectId } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { MongoCollection, MongoIndex } from './decorators'
import { TypeFerryMongoRegistry, mongoCollectionClass } from './registry'
import { typedMongoCollection } from './types'

interface Board extends Document {
  _id: ObjectId
  name: string
}

@MongoCollection('boards')
@MongoIndex({ name: 1 })
class BoardsCollectionDefinition {}

const BoardsCollection = typedMongoCollection<Board>(
  BoardsCollectionDefinition,
)

function createDbMock(): {
  readonly db: Db
  readonly collection: ReturnType<typeof vi.fn>
  readonly createIndex: ReturnType<typeof vi.fn>
} {
  const createIndex = vi.fn().mockResolvedValue('name_1')
  const collection = vi.fn((name: string) => ({
    collectionName: name,
    createIndex,
  }))
  return {
    db: { collection } as unknown as Db,
    collection,
    createIndex,
  }
}

describe('TypeFerryMongoRegistry', () => {
  it('normalizes raw classes and typed tokens to collection classes', () => {
    expect(mongoCollectionClass(BoardsCollection)).toBe(
      BoardsCollectionDefinition,
    )
    expect(mongoCollectionClass(BoardsCollectionDefinition)).toBe(
      BoardsCollectionDefinition,
    )
  })

  it('returns native collections and metadata for registered tokens', () => {
    const { db, collection } = createDbMock()
    const registry = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection] },
      { db, client: null, ownsClient: false },
    )

    expect(registry.meta(BoardsCollection).name).toBe('boards')
    expect(registry.collection(BoardsCollection)).toMatchObject({
      collectionName: 'boards',
    })
    expect(registry.collectionByName('boards')).toMatchObject({
      collectionName: 'boards',
    })
    expect(collection).toHaveBeenCalledWith('boards')
  })

  it('creates declared indexes without dropping existing indexes', async () => {
    const { db, createIndex } = createDbMock()
    const registry = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection] },
      { db, client: null, ownsClient: false },
    )

    await registry.ensureIndexes()

    expect(createIndex).toHaveBeenCalledWith({ name: 1 }, undefined)
  })

  it('closes owned clients but leaves external clients open by default', async () => {
    const { db } = createDbMock()
    const close = vi.fn().mockResolvedValue(undefined)
    const client = { close } as unknown as MongoClient

    const owned = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection] },
      { db, client, ownsClient: true },
    )
    await owned.close()
    expect(close).toHaveBeenCalledTimes(1)

    const external = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection] },
      { db, client, ownsClient: false },
    )
    await external.close()
    expect(close).toHaveBeenCalledTimes(1)

    const explicitlyClosed = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection], closeExternalClient: true },
      { db, client, ownsClient: false },
    )
    await explicitlyClosed.close()
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('rejects metadata lookups for unregistered collections', () => {
    const { db } = createDbMock()

    @MongoCollection('other')
    class OtherCollectionDefinition {}

    const registry = new TypeFerryMongoRegistry(
      { db, collections: [BoardsCollection] },
      { db, client: null, ownsClient: false },
    )

    expect(() => registry.meta(OtherCollectionDefinition)).toThrow(
      'is not registered',
    )
  })
})
