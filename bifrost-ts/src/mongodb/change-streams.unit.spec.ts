import type { ChangeStreamDocument, Collection } from 'mongodb'
import { ObjectId } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import {
  shouldSkipMongoWatchChange,
  startMongoWatch,
  toMongoWatchPayload,
} from './change-streams'

interface Board {
  _id: ObjectId
  name: string
  author: ObjectId
  updatedAt?: Date
  analytics?: number
}

function insertChange(board: Board): ChangeStreamDocument<Board> {
  return {
    _id: { token: 'insert' },
    operationType: 'insert',
    documentKey: { _id: board._id },
    fullDocument: board,
    ns: { db: 'test', coll: 'boards' },
  } as unknown as ChangeStreamDocument<Board>
}

function updateChange(
  fields: Partial<Board>,
): ChangeStreamDocument<Board> {
  const board = {
    _id: new ObjectId(),
    name: 'Roadmap',
    author: new ObjectId(),
    ...fields,
  }

  return {
    _id: { token: 'update' },
    operationType: 'update',
    documentKey: { _id: board._id },
    fullDocument: board,
    updateDescription: { updatedFields: fields },
    ns: { db: 'test', coll: 'boards' },
  } as unknown as ChangeStreamDocument<Board>
}

describe('mongodb change stream bridge', () => {
  it('builds public watch payloads from native change documents', () => {
    const board = {
      _id: new ObjectId(),
      name: 'Roadmap',
      author: new ObjectId(),
    }

    expect(toMongoWatchPayload(insertChange(board))).toEqual({
      eventId: JSON.stringify({ token: 'insert' }),
      _id: board._id,
      doc: board,
      deleted: false,
    })

    expect(
      toMongoWatchPayload({
        _id: { token: 'delete' },
        operationType: 'delete',
        documentKey: { _id: board._id },
        ns: { db: 'test', coll: 'boards' },
      } as unknown as ChangeStreamDocument<Board>),
    ).toEqual({
      eventId: JSON.stringify({ token: 'delete' }),
      _id: board._id,
      doc: null,
      deleted: true,
    })
  })

  it('skips timestamp-only and excluded-field-only updates', () => {
    expect(
      shouldSkipMongoWatchChange(updateChange({ updatedAt: new Date() }), {
        event: 'boards.changed',
      }),
    ).toBe(true)

    expect(
      shouldSkipMongoWatchChange(updateChange({ analytics: 1 }), {
        event: 'boards.changed',
        excludeFields: ['analytics'],
      }),
    ).toBe(true)

    expect(
      shouldSkipMongoWatchChange(updateChange({ name: 'Updated' }), {
        event: 'boards.changed',
        excludeFields: ['analytics'],
      }),
    ).toBe(false)
  })

  it('registers events and closes the active stream', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const stream = {
      close,
      async *[Symbol.asyncIterator]() {
        await new Promise(resolve => setTimeout(resolve, 10))
      },
    }
    const collection = {
      watch: vi.fn().mockReturnValue(stream),
    } as unknown as Collection<Board>
    const server = {
      addEvent: vi.fn(),
      channel: vi.fn(),
    }

    const handle = startMongoWatch({
      collection,
      definition: {
        Class: class BoardsCollectionDefinition {},
        name: 'boards',
        indexes: [],
        watches: [],
      },
      watch: { event: 'boards.changed', eventOptions: { protected: true } },
      server: server as never,
      reconnectDelayMs: 1,
    })

    await new Promise(resolve => setTimeout(resolve, 0))
    await handle.close()

    expect(server.addEvent).toHaveBeenCalledWith('boards.changed', {
      protected: true,
    })
    expect(collection.watch).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })
})
