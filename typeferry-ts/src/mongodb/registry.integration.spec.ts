import { ObjectId, type Document } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { MongoCollection, MongoIndex, MongoSchema } from './decorators'
import { createTypeFerryMongo, typedMongoCollection } from './index'
import { objectId } from './schema'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
}

function createCollections(boardName: string, nodeName: string) {
  @MongoCollection(boardName)
  @MongoSchema(
    z.strictObject({
      _id: objectId(),
      name: z.string(),
      author: objectId(),
    }),
  )
  @MongoIndex({ author: 1 })
  class BoardsCollectionDefinition {}

  @MongoCollection(nodeName)
  @MongoIndex({ board: 1, order: 1 }, { name: 'board_order' })
  class NodesCollectionDefinition {}

  return {
    BoardsCollection: typedMongoCollection<Board>(BoardsCollectionDefinition),
    NodesCollection: typedMongoCollection<{
      _id: ObjectId
      board: ObjectId
      order: number
    }>(NodesCollectionDefinition),
  }
}

describe('mongodb registry integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('registry.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('returns native collections and metadata for registered tokens', async () => {
    const { BoardsCollection, NodesCollection } = createCollections(
      harness.collectionName('boards'),
      harness.collectionName('nodes'),
    )
    const mongo = await createTypeFerryMongo({
      db: harness.db,
      collections: [BoardsCollection, NodesCollection],
    })

    try {
      const Boards = mongo.collection(BoardsCollection)
      const board = {
        _id: new ObjectId(),
        name: 'Roadmap',
        author: new ObjectId(),
      }

      await Boards.insertOne(board)

      await expect(Boards.findOne({ _id: board._id })).resolves.toMatchObject({
        name: 'Roadmap',
      })
      expect(mongo.collectionByName<Board>(mongo.meta(BoardsCollection).name))
        .toBe(Boards)
      expect(mongo.meta(NodesCollection).indexes[0]?.spec).toEqual({
        board: 1,
        order: 1,
      })
    } finally {
      await mongo.close()
    }
  })

  it('creates declared indexes on demand and during startup', async () => {
    const { BoardsCollection, NodesCollection } = createCollections(
      harness.collectionName('boards'),
      harness.collectionName('nodes'),
    )
    const mongo = await createTypeFerryMongo({
      db: harness.db,
      collections: [BoardsCollection, NodesCollection],
    })

    try {
      await mongo.ensureIndexes()

      await expect(
        mongo.collection(BoardsCollection).indexes(),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'author_1' }),
        ]),
      )
    } finally {
      await mongo.close()
    }

    await harness.reset()

    const startup = await createTypeFerryMongo({
      db: harness.db,
      collections: [BoardsCollection, NodesCollection],
      ensureIndexes: true,
    })

    try {
      await expect(
        startup.collection(NodesCollection).indexes(),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'board_order' }),
        ]),
      )
    } finally {
      await startup.close()
    }
  })

  it('creates and reconciles strict schema validators', async () => {
    const { BoardsCollection } = createCollections(
      harness.collectionName('validated_boards'),
      harness.collectionName('unused_nodes'),
    )
    const mongo = await createTypeFerryMongo({
      db: harness.db,
      collections: [BoardsCollection],
      ensureSchemas: true,
    })

    try {
      const Boards = mongo.collection(BoardsCollection)
      const RawBoards = mongo.collectionByName<Document>(
        mongo.meta(BoardsCollection).name,
      )
      await expect(
        Boards.insertOne({
          _id: new ObjectId(),
          name: 'Roadmap',
          author: new ObjectId(),
        }),
      ).resolves.toMatchObject({ acknowledged: true })

      await expect(
        RawBoards.insertOne({
          _id: new ObjectId(),
          name: 'Invalid',
          author: 'not-an-object-id',
        }),
      ).rejects.toMatchObject({ code: 121 })

      await harness.db.command({
        collMod: mongo.meta(BoardsCollection).name,
        validator: {},
      })
      await expect(mongo.ensureSchemas()).resolves.toBeUndefined()
      await expect(mongo.ensureSchemas()).resolves.toBeUndefined()

      await expect(
        RawBoards.insertOne({
          _id: new ObjectId(),
          name: 'Invalid again',
          author: 'not-an-object-id',
        }),
      ).rejects.toMatchObject({ code: 121 })

      const [collection] = await harness.db
        .listCollections(
          { name: mongo.meta(BoardsCollection).name },
          { nameOnly: false },
        )
        .toArray()
      expect(collection?.options).toMatchObject({
        validationLevel: 'strict',
        validationAction: 'error',
      })
    } finally {
      await mongo.close()
    }
  })
})
