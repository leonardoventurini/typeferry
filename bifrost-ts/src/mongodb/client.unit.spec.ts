import type { Db, MongoClient } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { resolveMongoConnection } from './client'

describe('resolveMongoConnection', () => {
  it('accepts an external Db without owning a client', async () => {
    const db = {} as Db

    await expect(
      resolveMongoConnection({ db, collections: [] }),
    ).resolves.toEqual({
      db,
      client: null,
      ownsClient: false,
    })
  })

  it('accepts an external MongoClient without owning it', async () => {
    const db = {} as Db
    const client = {
      db: vi.fn().mockReturnValue(db),
    } as unknown as MongoClient

    await expect(
      resolveMongoConnection({ client, dbName: 'app', collections: [] }),
    ).resolves.toEqual({
      db,
      client,
      ownsClient: false,
    })
  })

  it('rejects invalid source combinations before connecting', async () => {
    await expect(resolveMongoConnection({ collections: [] })).rejects.toThrow(
      'exactly one of db, client, or uri',
    )

    await expect(
      resolveMongoConnection({
        db: {} as Db,
        uri: 'mongodb://127.0.0.1:27017',
        collections: [],
      }),
    ).rejects.toThrow('exactly one of db, client, or uri')
  })
})
