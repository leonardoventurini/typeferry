import { ObjectId } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { MongoCollection, MongoWatch } from './decorators'
import { createTypeFerryMongo, typedMongoCollection } from './index'
import type { MongoWatchPayload } from './types'
import type { MongoIntegrationHarness } from './test/mongodb-test-utility'
import { createMongoIntegrationHarness } from './test/mongodb-test-utility'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
  analytics?: number
}

interface EmittedEvent {
  readonly channel: string
  readonly event: string
  readonly payload: MongoWatchPayload<Board>
}

function createServerRecorder(events: EmittedEvent[]) {
  return {
    addEvent: vi.fn(),
    channel: (channel: string) => ({
      emit(event: string, payload: MongoWatchPayload<Board>): void {
        events.push({ channel, event, payload })
      },
    }),
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('timed out waiting for MongoDB change stream event')
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

describe('mongodb change-stream integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('change-streams.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('emits TypeFerry events from native MongoDB change streams', async () => {
    if (!(await harness.supportsChangeStreams())) {
      console.warn(
        '[TypeFerry MongoDB] Skipping change-stream integration: local MongoDB is not a replica set.',
      )
      return
    }

    const events: EmittedEvent[] = []
    const collectionName = harness.collectionName('boards')

    @MongoCollection(collectionName)
    @MongoWatch<Board>({
      event: 'boards.changed',
      eventOptions: { protected: true },
      getChannel: board => board.author.toHexString(),
      excludeFields: ['analytics'],
    })
    class BoardsCollectionDefinition {}

    const BoardsCollection = typedMongoCollection<Board>(
      BoardsCollectionDefinition,
    )
    const server = createServerRecorder(events)
    const mongo = await createTypeFerryMongo({
      db: harness.db,
      server: server as never,
      collections: [BoardsCollection],
    })

    try {
      const Boards = mongo.collection(BoardsCollection)
      const author = new ObjectId()
      const board = { _id: new ObjectId(), name: 'Roadmap', author }

      await Boards.insertOne(board)
      await waitFor(() => events.length === 1)

      expect(server.addEvent).toHaveBeenCalledWith('boards.changed', {
        protected: true,
      })
      expect(events[0]).toMatchObject({
        channel: author.toHexString(),
        event: 'boards.changed',
        payload: {
          _id: board._id,
          deleted: false,
          doc: expect.objectContaining({ name: 'Roadmap' }),
        },
      })

      await Boards.updateOne({ _id: board._id }, { $set: { analytics: 1 } })
      await new Promise(resolve => setTimeout(resolve, 250))
      expect(events).toHaveLength(1)

      await Boards.updateOne({ _id: board._id }, { $set: { name: 'Updated' } })
      await waitFor(() => events.length === 2)
      expect(events[1]?.payload.doc).toMatchObject({ name: 'Updated' })

      await Boards.deleteOne({ _id: board._id })
      await waitFor(() => events.length === 3)
      expect(events[2]?.payload).toMatchObject({
        _id: board._id,
        doc: null,
        deleted: true,
      })
    } finally {
      await mongo.close()
    }
  })
})
