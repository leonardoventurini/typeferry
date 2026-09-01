import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { active, projection, withInsertTimestamps } from './index'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
  nodeCount: number
  deletedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

interface BoardNode {
  _id: ObjectId
  board: ObjectId
  text: string
  order: number
}

describe('mongodb driver parity integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('driver-parity.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('keeps native driver cursor, aggregation, and bulk semantics available', async () => {
    const Boards = harness.db.collection<Board>(harness.collectionName('boards'))
    const Nodes = harness.db.collection<BoardNode>(
      harness.collectionName('nodes'),
    )
    const author = new ObjectId()
    const first = withInsertTimestamps({
      _id: new ObjectId(),
      name: 'Roadmap',
      author,
      nodeCount: 0,
      deletedAt: null,
    })
    const second = withInsertTimestamps({
      _id: new ObjectId(),
      name: 'Archive',
      author,
      nodeCount: 0,
      deletedAt: new Date(),
    })

    await Boards.insertMany([first, second])
    await Nodes.bulkWrite([
      {
        insertOne: {
          document: {
            _id: new ObjectId(),
            board: first._id,
            text: 'First',
            order: 2,
          },
        },
      },
      {
        insertOne: {
          document: {
            _id: new ObjectId(),
            board: first._id,
            text: 'Second',
            order: 1,
          },
        },
      },
    ])

    await expect(
      Boards.find(active({ author }))
        .project(projection('name author'))
        .sort({ name: 1 })
        .limit(1)
        .toArray(),
    ).resolves.toEqual([
      expect.objectContaining({
        name: 'Roadmap',
        author,
      }),
    ])

    await expect(
      Boards.findOneAndUpdate(
        { _id: first._id },
        { $set: { nodeCount: 2 } },
        { returnDocument: 'after' },
      ),
    ).resolves.toMatchObject({ nodeCount: 2 })

    await expect(
      Nodes.aggregate<{ total: number }>([
        { $match: { board: first._id } },
        { $group: { _id: '$board', total: { $sum: 1 } } },
      ]).toArray(),
    ).resolves.toEqual([expect.objectContaining({ total: 2 })])
  })

  it('models common Mongoose migration patterns as explicit driver calls', async () => {
    const Boards = harness.db.collection<Board>(harness.collectionName('boards'))
    const Nodes = harness.db.collection<BoardNode>(
      harness.collectionName('nodes'),
    )
    const board = withInsertTimestamps({
      _id: new ObjectId(),
      name: 'Roadmap',
      author: new ObjectId(),
      nodeCount: 0,
      deletedAt: null,
    })

    await Boards.insertOne(board)
    await Nodes.insertMany([
      { _id: new ObjectId(), board: board._id, text: 'A', order: 2 },
      { _id: new ObjectId(), board: board._id, text: 'B', order: 1 },
    ])

    const leanReplacement = await Boards.findOne({ _id: board._id })
    expect(leanReplacement).toMatchObject({ name: 'Roadmap' })

    await Boards.updateOne({ _id: board._id }, { $set: { name: 'Updated' } })
    const explicitLoader = await Nodes.find({ board: board._id })
      .sort({ order: 1 })
      .toArray()

    expect(explicitLoader.map(node => node.text)).toEqual(['B', 'A'])

    async function updateDiskUsage(nodeCount: number): Promise<void> {
      await Boards.updateOne({ _id: board._id }, { $set: { nodeCount } })
    }

    await updateDiskUsage(explicitLoader.length)

    await expect(Boards.findOne({ _id: board._id })).resolves.toMatchObject({
      name: 'Updated',
      nodeCount: 2,
    })
  })
})
