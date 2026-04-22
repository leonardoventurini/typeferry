import { ObjectId, type UpdateFilter } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  active,
  findOneOrCreate,
  objectId,
  parseInsert,
  projection,
  withInsertTimestamps,
  withUpdateTimestamp,
} from './index'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date | null
}

const BoardSchema = z.object({
  _id: objectId(),
  name: z.string(),
  author: objectId(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable().optional(),
})

describe('mongodb helper integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('helpers.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('inserts parsed timestamped documents and reads them through the driver', async () => {
    const Boards = harness.db.collection<Board>(harness.collectionName('boards'))
    const now = new Date('2026-04-21T00:00:00.000Z')
    const board = parseInsert(
      BoardSchema,
      withInsertTimestamps(
        { _id: new ObjectId(), name: 'Roadmap', author: new ObjectId() },
        { now },
      ),
    )

    await Boards.insertOne(board)

    await expect(Boards.findOne({ _id: board._id })).resolves.toMatchObject({
      createdAt: now,
      updatedAt: now,
      name: 'Roadmap',
    })
  })

  it('uses explicit update, active filter, projection, and find-or-create helpers', async () => {
    const Boards = harness.db.collection<Board>(harness.collectionName('boards'))
    const author = new ObjectId()
    const now = new Date('2026-04-21T00:00:00.000Z')
    const board = withInsertTimestamps(
      { _id: new ObjectId(), name: 'Roadmap', author, deletedAt: null },
      { now },
    )

    await Boards.insertOne(board)

    await Boards.updateOne(
      { _id: board._id },
      withUpdateTimestamp<UpdateFilter<Board>>(
        { $set: { name: 'Updated' }, $inc: { version: 1 } },
        { now },
      ),
    )

    await expect(
      Boards.find(active({ author }), { projection: projection('name author') })
        .toArray(),
    ).resolves.toEqual([
      expect.objectContaining({
        name: 'Updated',
        author,
      }),
    ])

    const created = await findOneOrCreate(
      Boards,
      { name: 'Created' },
      withInsertTimestamps({
        _id: new ObjectId(),
        name: 'Created',
        author,
      }),
    )
    const existing = await findOneOrCreate(
      Boards,
      { name: 'Created' },
      withInsertTimestamps({
        _id: new ObjectId(),
        name: 'Different',
        author,
      }),
    )

    expect(existing._id.toHexString()).toBe(created._id.toHexString())
  })
})
