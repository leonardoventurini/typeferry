import { ObjectId } from 'mongodb'
import NodeWebSocket from 'ws'
import { z } from 'zod'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { Client } from '../../client'
import { Server } from '../../server'
import { ClientEvents, ServerEvents } from '../../utils'
import { MongoCollection } from '../decorators'
import {
  createBifrostMongo,
  typedMongoCollection,
} from '../index'
import type { MongoIntegrationHarness } from '../test/mongodb-test-utility'
import { createMongoIntegrationHarness } from '../test/mongodb-test-utility'
import { createMongoLiveView } from './client'
import { defineMongoLivePublication } from './publication'
import {
  mongoLivePublication,
  type MongoLiveClientDocument,
} from './types'

interface Board {
  _id: ObjectId
  owner: string
  name: string
  secret: string
}

interface BoardFields {
  readonly name: string
}

type ClientBoard = MongoLiveClientDocument<BoardFields>

const boardsDescriptor = mongoLivePublication<
  { readonly owner: string },
  ClientBoard
>()('boards.mine')

describe('MongoDB live views integration', () => {
  let harness: MongoIntegrationHarness

  beforeAll(async () => {
    harness = await createMongoIntegrationHarness('live-views.integration.spec')
  })

  beforeEach(async () => {
    await harness.reset()
  })

  afterAll(async () => {
    await harness.close()
  })

  it('materializes snapshot and membership transitions over Bifrost', async () => {
    if (!(await harness.supportsChangeStreams())) {
      if (process.env.CI) {
        throw new Error(
          'MongoDB live-view integration requires a replica set in CI.',
        )
      }
      console.warn(
        '[Bifrost MongoDB] Skipping live-view integration: local MongoDB is not a replica set.',
      )
      return
    }

    globalThis.WebSocket = NodeWebSocket as unknown as typeof WebSocket
    const collectionName = harness.collectionName('boards')

    @MongoCollection(collectionName)
    class BoardsCollectionDefinition {}

    const BoardsToken = typedMongoCollection<Board>(
      BoardsCollectionDefinition,
    )
    const publication = defineMongoLivePublication(boardsDescriptor, {
      collection: BoardsToken,
      args: z.object({ owner: z.string() }),
      protected: false,
      authorize: (_context, args) => ({ owner: args.owner }),
      filter: scope => ({ owner: scope.owner }),
      project: document => ({ name: document.name }),
    })

    const server = await createServer()
    const mongo = await createBifrostMongo({
      db: harness.db,
      server,
      collections: [BoardsToken],
      live: { publications: [publication] },
    })
    const Boards = mongo.collection(BoardsToken)
    const initial = {
      _id: new ObjectId(),
      owner: 'owner-1',
      name: 'Initial',
      secret: 'never publish',
    }
    await Boards.insertOne(initial)

    const client = await createClient(server.port)
    const view = createMongoLiveView({
      client,
      publication: boardsDescriptor,
      args: { owner: 'owner-1' },
    })

    try {
      await view.start()
      expect(view.getSnapshot()).toMatchObject({
        status: 'ready',
        documents: [
          { _id: initial._id.toHexString(), name: 'Initial' },
        ],
      })
      expect(view.getSnapshot().documents[0]).not.toHaveProperty('secret')

      const inserted = {
        _id: new ObjectId(),
        owner: 'owner-1',
        name: 'Added',
        secret: 'hidden',
      }
      await Boards.insertOne(inserted)
      await waitFor(() => view.getSnapshot().documents.length === 2)

      await Boards.updateOne(
        { _id: inserted._id },
        { $set: { name: 'Changed' } },
      )
      await waitFor(
        () =>
          view
            .getSnapshot()
            .documents.some(document => document.name === 'Changed'),
      )

      await Boards.updateOne(
        { _id: inserted._id },
        { $set: { owner: 'owner-2' } },
      )
      await waitFor(() => view.getSnapshot().documents.length === 1)

      await Boards.deleteOne({ _id: initial._id })
      await waitFor(() => view.getSnapshot().documents.length === 0)
    } finally {
      await view.stop()
      await client.close()
      await mongo.close()
      await server.close()
    }
  })

  it('replays a matching write that lands while the snapshot is projecting', async () => {
    if (!(await harness.supportsChangeStreams())) {
      if (process.env.CI) {
        throw new Error(
          'MongoDB live-view handoff integration requires a replica set in CI.',
        )
      }
      console.warn(
        '[Bifrost MongoDB] Skipping live-view handoff integration: local MongoDB is not a replica set.',
      )
      return
    }

    globalThis.WebSocket = NodeWebSocket as unknown as typeof WebSocket
    const collectionName = harness.collectionName('handoff_boards')

    @MongoCollection(collectionName)
    class HandoffBoardsCollectionDefinition {}

    const BoardsToken = typedMongoCollection<Board>(
      HandoffBoardsCollectionDefinition,
    )
    let releaseProjection: (() => void) | null = null
    let signalProjectionStarted: (() => void) | null = null
    const projectionGate = new Promise<void>(resolve => {
      releaseProjection = resolve
    })
    const projectionStarted = new Promise<void>(resolve => {
      signalProjectionStarted = resolve
    })
    const publication = defineMongoLivePublication(boardsDescriptor, {
      collection: BoardsToken,
      args: z.object({ owner: z.string() }),
      protected: false,
      authorize: (_context, args) => ({ owner: args.owner }),
      filter: scope => ({ owner: scope.owner }),
      project: async document => {
        if (document.name === 'Initial') {
          signalProjectionStarted?.()
          await projectionGate
        }
        return { name: document.name }
      },
    })

    const server = await createServer()
    const mongo = await createBifrostMongo({
      db: harness.db,
      server,
      collections: [BoardsToken],
      live: { publications: [publication] },
    })
    const Boards = mongo.collection(BoardsToken)
    await Boards.insertOne({
      _id: new ObjectId(),
      owner: 'owner-1',
      name: 'Initial',
      secret: 'hidden',
    })
    const client = await createClient(server.port)
    const view = createMongoLiveView({
      client,
      publication: boardsDescriptor,
      args: { owner: 'owner-1' },
    })

    try {
      const starting = view.start()
      await projectionStarted
      await Boards.insertOne({
        _id: new ObjectId(),
        owner: 'owner-1',
        name: 'During snapshot',
        secret: 'hidden',
      })
      releaseProjection?.()
      await starting
      await waitFor(() => view.getSnapshot().documents.length === 2)

      expect(
        view
          .getSnapshot()
          .documents.map(document => document.name)
          .sort(),
      ).toEqual(['During snapshot', 'Initial'])
    } finally {
      releaseProjection?.()
      await view.stop()
      await client.close()
      await mongo.close()
      await server.close()
    }
  })
})

async function createServer(): Promise<Server> {
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    globalInstance: false,
  })
  if (!server.ready) {
    await new Promise<void>((resolve, reject) => {
      server.once(ServerEvents.READY, () => resolve())
      server.once(Server.ERROR_EVENT, reject)
    })
  }
  return server
}

async function createClient(port: number): Promise<Client> {
  const client = new Client({ host: '127.0.0.1', port })
  if (!client.initialized) {
    await new Promise<void>((resolve, reject) => {
      client.once(ClientEvents.INITIALIZED, () => resolve())
      client.once(ClientEvents.ERROR, reject)
    })
  }
  return client
}

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 5_000,
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMilliseconds) {
      throw new Error('timed out waiting for MongoDB live view')
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}
