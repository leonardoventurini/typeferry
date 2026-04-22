import { MongoClient, ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MongoCollection } from './decorators'
import { createBifrostMongo, typedMongoCollection } from './index'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
}

function createBoardToken(collectionName: string) {
  @MongoCollection(collectionName)
  class BoardsCollectionDefinition {}

  return typedMongoCollection<Board>(BoardsCollectionDefinition)
}

describe('mongodb client integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('client.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('connects from uri and returns native collections', async () => {
    const BoardsCollection = createBoardToken(harness.collectionName('boards'))
    const mongo = await createBifrostMongo({
      uri: harness.uri,
      dbName: harness.dbName,
      collections: [BoardsCollection],
    })

    try {
      const Boards = mongo.collection(BoardsCollection)
      const board = { _id: new ObjectId(), name: 'Roadmap' }

      await Boards.insertOne(board)

      await expect(Boards.findOne({ _id: board._id })).resolves.toMatchObject({
        name: 'Roadmap',
      })
    } finally {
      await mongo.close()
    }
  })

  it('reuses an external MongoClient without closing it by default', async () => {
    const client = new MongoClient(harness.uri)
    await client.connect()
    const BoardsCollection = createBoardToken(harness.collectionName('boards'))
    const mongo = await createBifrostMongo({
      client,
      dbName: harness.dbName,
      collections: [BoardsCollection],
    })

    await mongo.close()

    await expect(client.db(harness.dbName).command({ ping: 1 })).resolves.toEqual(
      expect.objectContaining({ ok: 1 }),
    )
    await client.close()
  })

  it('can close an external MongoClient when explicitly configured', async () => {
    const client = new MongoClient(harness.uri)
    await client.connect()
    const BoardsCollection = createBoardToken(harness.collectionName('boards'))
    const mongo = await createBifrostMongo({
      client,
      dbName: harness.dbName,
      collections: [BoardsCollection],
      closeExternalClient: true,
    })

    await mongo.close()

    await expect(client.db(harness.dbName).command({ ping: 1 })).rejects.toThrow()
  })

  it('reuses an external Db handle', async () => {
    const BoardsCollection = createBoardToken(harness.collectionName('boards'))
    const mongo = await createBifrostMongo({
      db: harness.db,
      collections: [BoardsCollection],
    })

    try {
      const Boards = mongo.collection(BoardsCollection)
      await Boards.insertOne({ _id: new ObjectId(), name: 'Roadmap' })

      await expect(Boards.countDocuments()).resolves.toBe(1)
    } finally {
      await mongo.close()
    }
  })

  it('rejects invalid source combinations before connecting', async () => {
    const BoardsCollection = createBoardToken(harness.collectionName('boards'))

    await expect(
      createBifrostMongo({ collections: [BoardsCollection] }),
    ).rejects.toThrow('exactly one of db, client, or uri')

    await expect(
      createBifrostMongo({
        db: harness.db,
        uri: harness.uri,
        collections: [BoardsCollection],
      }),
    ).rejects.toThrow('exactly one of db, client, or uri')
  })
})
