import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeEach } from 'typeferry/test'

const mongoServer = await MongoMemoryReplSet.create({
  replSet: { count: 1, name: 'rs0' },
})

process.env['CLIENT_ORIGIN'] = 'http://localhost:8000'
process.env['DATABASE_URL'] = mongoServer.getUri('typeferry-template-test')
process.env['LOG_LEVEL'] = 'error'
process.env['NODE_ENV'] = 'test'
process.env['PORT'] = '8002'
process.env['SAMPLE_AUTH_TOKEN'] = 'test-auth-token-value'

const { connectDatabase, disconnectDatabase, getDatabase } =
  await import('@/server/data/database')
await connectDatabase()

beforeEach(async (): Promise<void> => {
  const collections = await getDatabase().collections()
  await Promise.all(collections.map(collection => collection.deleteMany({})))
})

afterAll(async (): Promise<void> => {
  await disconnectDatabase()
  await mongoServer.stop()
})
