# Bifrost MongoDB

`@example-app/bifrost/mongodb` connects Bifrost servers to the official MongoDB
driver without introducing a second ORM layer.

The package owns:

- connection and registry setup
- decorator metadata
- optional index creation
- ObjectId and Zod parsing helpers
- explicit timestamp, projection, soft-delete, and find-or-create helpers
- MongoDB change-stream events emitted through Bifrost

Application code still owns native driver operations:

- `Collection<TDocument>`
- `FindCursor<TDocument>`
- sessions and transactions
- aggregation pipelines
- bulk writes
- app-specific relationship loaders
- domain service functions

## Package Surface

```ts
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import {
  MongoCollection,
  MongoIndex,
  MongoSchema,
  MongoWatch,
  createBifrostMongo,
  objectId,
  typedMongoCollection,
  withInsertTimestamps,
} from '@example-app/bifrost/mongodb'

const BoardSchema = z.object({
  _id: objectId(),
  name: z.string().min(1),
  author: objectId(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type Board = z.infer<typeof BoardSchema>

@MongoCollection('boards')
@MongoSchema(BoardSchema)
@MongoIndex({ author: 1 })
@MongoWatch<Board>({
  event: 'boards.changed',
  eventOptions: { protected: true },
  getChannel: board => board.author.toHexString(),
})
class BoardsCollectionDefinition {}

export const BoardsCollection = typedMongoCollection<Board>(
  BoardsCollectionDefinition,
)

const mongo = await createBifrostMongo({
  uri: process.env.DATABASE,
  dbName: 'example-app',
  collections: [BoardsCollection],
})

export const Boards = mongo.collection(BoardsCollection)

await Boards.insertOne(
  BoardSchema.parse(
    withInsertTimestamps({
      _id: new ObjectId(),
      name: 'Roadmap',
      author: new ObjectId(),
    }),
  ),
)
```

`typedMongoCollection<TDocument>()` is intentionally separate from
`@MongoCollection()`. Decorators attach runtime metadata; the typed token
carries the compile-time document type.

## Native Driver First

Use native driver calls for reads and writes:

```ts
const boards = await Boards.find({ author })
  .project({ name: 1, updatedAt: 1 })
  .sort({ updatedAt: -1 })
  .limit(20)
  .toArray()

await mongo.client?.withSession(async session => {
  await session.withTransaction(async () => {
    await Boards.updateOne({ _id: boardId }, update, { session })
  })
})
```

The package does not provide repositories, query builders, hydrated documents,
automatic populate, or plugin middleware.

## Migration Notes

- `Model.find(...).lean()` becomes `collection.find(...).toArray()`.
- `Model.findOne(...).lean()` becomes `collection.findOne(...)`.
- `Model.findById(id).lean()` becomes
  `collection.findOne({ _id: toObjectId(id) })`.
- `.select('name author')` becomes `{ projection: projection('name author') }`.
- `.lean(false).save()` becomes explicit `updateOne()` or `replaceOne()`.
- `populate()` becomes a domain-specific batched loader or `$lookup`.
- model statics become exported service functions.
- plugins and hooks become explicit write paths or non-critical watchers.

## Integration Tests

MongoDB integration tests use the existing local instance by default:

```sh
cd bifrost-ts
BIFROST_MONGODB_TEST_URI=mongodb://127.0.0.1:27017 \
BIFROST_MONGODB_TEST_DB=bifrost_mongodb_integration_test \
bun run test:integration -- src/mongodb
```

The harness refuses to clean a database unless its name starts with
`bifrost_mongodb_` and ends with `_test`.

Standalone MongoDB instances can run all non-watch integration tests.
Change-stream assertions require a replica set and return early with a
diagnostic when the local server does not support change streams.
