import { describe, expect, it, vi } from 'vitest'

import type { Client } from '../../client'
import EventEmitter2 from '../../utils/event-emitter'
import { createMongoLiveView } from './client'
import {
  MONGO_LIVE_EVENT,
  MONGO_LIVE_RESYNC_METHOD,
  MONGO_LIVE_SUBSCRIBE_METHOD,
  MONGO_LIVE_UNSUBSCRIBE_METHOD,
  mongoLivePublication,
  type MongoLiveClientDocument,
  type MongoLiveSnapshot,
} from './types'

interface BoardFields {
  readonly name: string
}

type Board = MongoLiveClientDocument<BoardFields>

const boardsPublication = mongoLivePublication<{ owner: string }, Board>()(
  'boards.mine',
)

interface MockClient extends EventEmitter2 {
  call: ReturnType<typeof vi.fn>
  clientSocket: { ready: boolean }
}

function createClient(): MockClient {
  const client = new EventEmitter2() as MockClient
  client.call = vi.fn()
  client.clientSocket = { ready: true }
  return client
}

describe('MongoLiveView', () => {
  it('buffers an early delta and materializes snapshot transitions', async () => {
    const client = createClient()
    const firstId = '64b000000000000000000001'
    const secondId = '64b000000000000000000002'
    let resolveSnapshot:
      | ((snapshot: MongoLiveSnapshot<Board>) => void)
      | undefined
    client.call.mockImplementation((method: string) => {
      if (method === MONGO_LIVE_SUBSCRIBE_METHOD) {
        return new Promise<MongoLiveSnapshot<Board>>(resolve => {
          resolveSnapshot = resolve
        })
      }
      return Promise.resolve(true)
    })
    const view = createMongoLiveView({
      client: client as unknown as Client,
      publication: boardsPublication,
      args: { owner: 'owner-1' },
    })

    const starting = view.start()
    client.emit(MONGO_LIVE_EVENT, {
      type: 'delta',
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 1,
      operations: [
        {
          type: 'added',
          document: { _id: secondId, name: 'Early' },
        },
      ],
    })
    resolveSnapshot?.({
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 0,
      documents: [{ _id: firstId, name: 'Initial' }],
    })
    await starting

    expect(view.getSnapshot().status).toBe('ready')
    expect(view.getSnapshot().documents.map(document => document.name)).toEqual([
      'Initial',
      'Early',
    ])

    client.emit(MONGO_LIVE_EVENT, {
      type: 'delta',
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 2,
      operations: [{ type: 'removed', id: firstId }],
    })
    expect(view.getSnapshot().documents).toEqual([
      { _id: secondId, name: 'Early' },
    ])

    await view.stop()
    expect(client.call).toHaveBeenCalledWith(
      MONGO_LIVE_UNSUBSCRIBE_METHOD,
      expect.anything(),
      expect.objectContaining({ httpFallback: false }),
    )
  })

  it('detects sequence gaps and performs one authoritative resync', async () => {
    const client = createClient()
    const id = '64b000000000000000000003'
    client.call.mockImplementation((method: string) => {
      if (method === MONGO_LIVE_SUBSCRIBE_METHOD) {
        return Promise.resolve({
          subscriptionId: readSubscriptionId(client),
          generation: 'generation-1',
          sequence: 0,
          documents: [],
        })
      }
      if (method === MONGO_LIVE_RESYNC_METHOD) {
        return Promise.resolve({
          subscriptionId: readSubscriptionId(client),
          generation: 'generation-2',
          sequence: 0,
          documents: [{ _id: id, name: 'Recovered' }],
        })
      }
      return Promise.resolve(true)
    })
    const view = createMongoLiveView({
      client: client as unknown as Client,
      publication: boardsPublication,
      args: { owner: 'owner-1' },
    })
    await view.start()

    const gap = {
      type: 'delta',
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 2,
      operations: [],
    }
    client.emit(MONGO_LIVE_EVENT, gap)
    client.emit(MONGO_LIVE_EVENT, gap)
    await waitFor(() => view.getSnapshot().status === 'ready')

    expect(
      client.call.mock.calls.filter(
        ([method]) => method === MONGO_LIVE_RESYNC_METHOD,
      ),
    ).toHaveLength(1)
    expect(view.getSnapshot().documents).toEqual([
      { _id: id, name: 'Recovered' },
    ])
    await view.stop()
  })

  it('resyncs once when an early delta skips the snapshot sequence', async () => {
    const client = createClient()
    let resolveSnapshot:
      | ((snapshot: MongoLiveSnapshot<Board>) => void)
      | undefined
    client.call.mockImplementation((method: string) => {
      if (method === MONGO_LIVE_SUBSCRIBE_METHOD) {
        return new Promise<MongoLiveSnapshot<Board>>(resolve => {
          resolveSnapshot = resolve
        })
      }
      if (method === MONGO_LIVE_RESYNC_METHOD) {
        return Promise.resolve({
          subscriptionId: readSubscriptionId(client),
          generation: 'generation-2',
          sequence: 0,
          documents: [],
        })
      }
      return Promise.resolve(true)
    })
    const view = createMongoLiveView({
      client: client as unknown as Client,
      publication: boardsPublication,
      args: { owner: 'owner-1' },
    })

    const starting = view.start()
    client.emit(MONGO_LIVE_EVENT, {
      type: 'delta',
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 2,
      operations: [],
    })
    resolveSnapshot?.({
      subscriptionId: readSubscriptionId(client),
      generation: 'generation-1',
      sequence: 0,
      documents: [],
    })
    await starting
    await waitFor(() => view.getSnapshot().status === 'ready')

    expect(
      client.call.mock.calls.filter(
        ([method]) => method === MONGO_LIVE_RESYNC_METHOD,
      ),
    ).toHaveLength(1)
    await view.stop()
  })
})

function readSubscriptionId(client: MockClient): string {
  const subscribeCall = client.call.mock.calls.find(
    ([method]) => method === MONGO_LIVE_SUBSCRIBE_METHOD,
  )
  return subscribeCall?.[1].subscriptionId as string
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error('timed out waiting for live view')
}
