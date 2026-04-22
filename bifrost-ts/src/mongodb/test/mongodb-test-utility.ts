import { MongoClient, type Db } from 'mongodb'

/** Default MongoDB URI used by integration tests. */
export const DEFAULT_MONGODB_TEST_URI =
  'mongodb://127.0.0.1:27017' as const

/** Default guarded MongoDB database used by integration tests. */
export const DEFAULT_MONGODB_TEST_DB =
  'bifrost_mongodb_integration_test' as const

/** Shared handles and helpers for MongoDB integration tests. */
export interface MongoIntegrationHarness {
  /** URI used to connect the test client. */
  readonly uri: string
  /** Guarded test database name. */
  readonly dbName: string
  /** Native MongoDB client owned by the harness. */
  readonly client: MongoClient
  /** Native MongoDB database owned by the harness. */
  readonly db: Db
  /** Builds a stable collection name for a test file and logical collection. */
  readonly collectionName: (baseName: string) => string
  /** Drops the guarded test database before a test. */
  readonly reset: () => Promise<void>
  /** Drops the guarded test database and closes the harness client. */
  readonly close: () => Promise<void>
  /** Detects whether the local server supports change streams. */
  readonly supportsChangeStreams: () => Promise<boolean>
}

/** Creates a MongoDB integration harness against the configured local test database. */
export async function createMongoIntegrationHarness(
  testFileName: string,
): Promise<MongoIntegrationHarness> {
  const uri = process.env.BIFROST_MONGODB_TEST_URI ?? DEFAULT_MONGODB_TEST_URI
  const dbName =
    process.env.BIFROST_MONGODB_TEST_DB ?? DEFAULT_MONGODB_TEST_DB

  assertSafeMongoTestDatabase(dbName)

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(dbName)
  const prefix = sanitizeCollectionPrefix(testFileName)

  return {
    uri,
    dbName,
    client,
    db,
    collectionName: (baseName: string): string =>
      `${prefix}_${sanitizeCollectionPrefix(baseName)}`,
    reset: async (): Promise<void> => {
      assertSafeMongoTestDatabase(dbName)
      await db.dropDatabase()
    },
    close: async (): Promise<void> => {
      assertSafeMongoTestDatabase(dbName)
      await db.dropDatabase()
      await client.close()
    },
    supportsChangeStreams: async (): Promise<boolean> => {
      const hello = await db.admin().command({ hello: 1 })
      return (
        typeof hello.setName === 'string' ||
        typeof hello.msg === 'string' && hello.msg === 'isdbgrid'
      )
    },
  }
}

/** Refuses destructive test cleanup outside the Bifrost MongoDB test namespace. */
export function assertSafeMongoTestDatabase(dbName: string): void {
  if (!dbName.startsWith('bifrost_mongodb_') || !dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to clean unsafe MongoDB database "${dbName}". ` +
        'Use a name like bifrost_mongodb_integration_test.',
    )
  }
}

function sanitizeCollectionPrefix(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9]/g, '_').replaceAll(/_+/g, '_')
}
