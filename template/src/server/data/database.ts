import { MongoClient, type Db } from 'mongodb'

import { env } from '@/server/config/environment'
import { logger } from '@/server/logging/logger'

let mongoClient: MongoClient | undefined
let database: Db | undefined

/** Opens the process-wide MongoDB connection and returns its database. */
export async function connectDatabase(): Promise<Db> {
  if (database) return database

  logger.info({}, 'Connecting to MongoDB')
  const client = new MongoClient(env.DATABASE_URL, {
    serverSelectionTimeoutMS: 10_000,
  })
  try {
    await client.connect()
  } catch (error) {
    await client.close()
    throw error
  }

  mongoClient = client
  database = client.db()
  logger.info({ database: database.databaseName }, 'Connected to MongoDB')
  return database
}

/** Returns the connected database or rejects invalid startup ordering. */
export function getDatabase(): Db {
  if (!database) {
    throw new Error('MongoDB must be connected before the database is used.')
  }

  return database
}

/** Gracefully closes the process-wide MongoDB connection. */
export async function disconnectDatabase(): Promise<void> {
  if (!mongoClient) return

  const client = mongoClient
  mongoClient = undefined
  database = undefined
  await client.close()
  logger.info({}, 'Disconnected from MongoDB')
}
