import { MongoClient, type Db } from 'mongodb'

import type { BifrostMongoOptions } from './types'

/** Resolved MongoDB handles and lifecycle ownership for the registry. */
export interface ResolvedMongoConnection {
  /** Database handle used by registered collections. */
  readonly db: Db
  /** Client handle when one is known. */
  readonly client: MongoClient | null
  /** Whether `close()` should close the client by default. */
  readonly ownsClient: boolean
}

/** Resolves `Db`, `MongoClient`, or URI options into concrete MongoDB handles. */
export async function resolveMongoConnection(
  options: BifrostMongoOptions,
): Promise<ResolvedMongoConnection> {
  const sourceCount = [options.db, options.client, options.uri].filter(
    Boolean,
  ).length

  if (sourceCount !== 1) {
    throw new Error(
      'createBifrostMongo requires exactly one of db, client, or uri.',
    )
  }

  if (options.db) {
    return {
      db: options.db,
      client: null,
      ownsClient: false,
    }
  }

  if (options.client) {
    return {
      db: options.client.db(options.dbName),
      client: options.client,
      ownsClient: false,
    }
  }

  const client = new MongoClient(options.uri ?? '', options.clientOptions)
  await client.connect()

  return {
    db: client.db(options.dbName),
    client,
    ownsClient: true,
  }
}
