import type { Db, MongoClient } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

const { resolveMongoConnection } = vi.hoisted(() => ({
  resolveMongoConnection: vi.fn(),
}))

vi.mock('./client', () => ({ resolveMongoConnection }))

import { MongoCollection } from './decorators'
import { createTypeFerryMongo } from './registry'

@MongoCollection('missing_schema')
class MissingSchemaCollectionDefinition {}

describe('createTypeFerryMongo lifecycle', () => {
  it('closes an owned client when startup schema reconciliation fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const client = { close } as unknown as MongoClient
    const db = {
      collection: vi.fn().mockReturnValue({}),
    } as unknown as Db

    resolveMongoConnection.mockResolvedValue({
      db,
      client,
      ownsClient: true,
    })

    await expect(
      createTypeFerryMongo({
        client,
        collections: [MissingSchemaCollectionDefinition],
        ensureSchemas: true,
      }),
    ).rejects.toThrow('missing @MongoSchema metadata')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
