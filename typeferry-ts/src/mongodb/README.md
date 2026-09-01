# TypeFerry MongoDB

`typeferry-ts/mongodb` connects TypeFerry servers to the official MongoDB
driver without introducing a second ORM layer.

The package owns:

- connection and registry setup
- decorator metadata
- optional index creation
- ObjectId and Zod parsing helpers
- explicit timestamp, projection, soft-delete, and find-or-create helpers
- MongoDB change-stream events emitted through TypeFerry

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
  createTypeFerryMongo,
  objectId,
  typedMongoCollection,
  withInsertTimestamps,
} from 'typeferry-ts/mongodb'

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

const mongo = await createTypeFerryMongo({
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
cd typeferry-ts
TYPEFERRY_MONGODB_TEST_URI=mongodb://127.0.0.1:27017 \
TYPEFERRY_MONGODB_TEST_DB=typeferry_mongodb_integration_test \
npm run test:integration -- src/mongodb
```

The harness refuses to clean a database unless its name starts with
`typeferry_mongodb_` and ends with `_test`.

Standalone MongoDB instances can run all non-watch integration tests.
Change-stream assertions require a replica set and return early with a
diagnostic when the local server does not support change streams.

## Live publications

Live publications materialize a named, server-owned MongoDB query in a TypeFerry
client. They return one authoritative snapshot and then apply `added`,
`changed`, and `removed` operations over the existing WebSocket event
transport. Clients never submit collection names, MongoDB selectors,
projections, or aggregation pipelines.

```ts
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import {
  createTypeFerryMongo,
  createMongoLiveView,
  defineMongoLivePublication,
  mongoLivePublication,
  type MongoLiveClientDocument,
} from 'typeferry-ts/mongodb'

interface BoardFields {
  readonly name: string
}

interface Board {
  readonly _id: ObjectId
  readonly owner: ObjectId
  readonly name: string
  readonly priority: number
}

type LiveBoard = MongoLiveClientDocument<BoardFields>

export const BoardsForOwner = mongoLivePublication<
  { readonly owner: string },
  LiveBoard
>()('boards.for-owner')

const boardsForOwner = defineMongoLivePublication(BoardsForOwner, {
  collection: BoardsCollection,
  args: z.object({ owner: z.string() }),
  authorize: (context, args) => {
    if (context.client.userId !== args.owner) {
      throw new Error('forbidden')
    }
    return { owner: args.owner }
  },
  filter: scope => ({ owner: scope.owner }),
  window: () => ({
    sort: { priority: -1 as const },
    skip: 0,
    limit: 25,
  }),
  project: board => ({ name: board.name }),
})

const mongo = await createTypeFerryMongo({
  uri: process.env.DATABASE,
  dbName: 'example-app',
  server,
  collections: [BoardsCollection],
  live: {
    publications: [boardsForOwner],
  },
})
```

The projector cannot own `_id`; the engine injects the stable source identity.
MongoDB `ObjectId` values materialize as `{ $objectId: "<hex>" }` on the
client. The discriminated form cannot collide with a native string `_id`
containing the same hexadecimal value. Legacy clients that do not advertise
typed ObjectId support retain bare hexadecimal strings for unordered
publications; ordered windows require the collision-proof form.
Publications require authentication by default. Set `protected: false`
explicitly for public data.

The framework-independent client is available from the same package:

```ts
const view = createMongoLiveView({
  client,
  publication: BoardsForOwner,
  args: { owner: userId },
})

view.subscribe(() => {
  const { status, documents, error } = view.getSnapshot()
  // Render connecting, ready, resyncing, stopped, and error states precisely.
})

await view.start()
```

React applications can use the thin adapter:

```tsx
import { useMongoLivePublication } from 'typeferry-ts/react'

const boards = useMongoLivePublication({
  publication: BoardsForOwner,
  args: { owner: userId },
})
```

### MVP consistency and limits

- Publications without `window` remain unordered sets.
- A publication can define a stable reactive `sort`, bounded `skip`, and
  required `limit`. The runtime appends `_id: 1` as a deterministic final
  tie-breaker, so `_id` cannot be supplied in the application sort.
- Ordered delivery is capability-negotiated; legacy clients are rejected
  before the server can send a positional splice they do not understand.
- Ordered observers coalesce a write burst to at most one running and one
  pending complete indexed window query. This preserves exact boundary
  membership while bounding observer work; query amplification remains
  proportional to active ordered subscriptions.
- Ordered window defaults allow at most 100,000 skipped documents and use the
  snapshot document limit as the maximum `limit`.
- Joins, aggregation pipelines/windows, collation-specific ordering, nested
  sort paths, unbounded ordered results, and keyset/cursor windows are not
  supported.
- Snapshot and membership reads use MongoDB majority read concern.
- Every connection subscription has its own observer and generation.
- A sequence gap, source discontinuity, or slow WebSocket moves the client out
  of `ready` and requires a complete resnapshot.
- Subscribe, resync, and unsubscribe are WebSocket-only and never fall back to
  HTTP.
- Defaults: 32 subscriptions per connection, 10,000 snapshot documents, and a
  2 MiB native WebSocket buffer threshold.
- The document-count bound is enforced before the cursor materializes more
  than 10,001 results. The MVP does not yet impose a separate encoded-byte
  bound on a snapshot.
- Live views require a replica set or sharded MongoDB deployment. They do not
  fall back to polling.
- Call `mongo.close()` before `server.close()` so observers, server listeners,
  reserved methods, and streams drain in order.

Create a compound index beginning with the publication filter fields and
continuing through its declared sort fields plus `_id`. Inspect the native
MongoDB query plan before enabling an ordered publication on a write-heavy
collection.

Run the live integration against a replica set:

```sh
TYPEFERRY_MONGODB_TEST_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
TYPEFERRY_MONGODB_TEST_DB=typeferry_mongodb_live_test \
npm run test:integration -- src/mongodb/live
```
