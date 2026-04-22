import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MongoCollection, MongoIndex } from './decorators'
import { createBifrostMongo, typedMongoCollection } from './index'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
}

function createCollections(boardName: string, nodeName: string) {
  @MongoCollection(boardName)
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
    const mongo = await createBifrostMongo({
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
    const mongo = await createBifrostMongo({
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

    const startup = await createBifrostMongo({
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
})
