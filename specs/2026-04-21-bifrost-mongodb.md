# Bifrost MongoDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` by default to implement this plan task-by-task. If delegation is unavailable, continue in the current session with the same checklist, risk, and verification discipline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@example-app/bifrost/mongodb` as a lean, decorator-driven bridge between Bifrost and the official MongoDB driver so ExampleApp can remove Mongoose without replacing it with another ORM.

**Architecture:** The package owns connection lifecycle, collection metadata, schema validation helpers, index registration, ObjectId helpers, and change-stream-to-Bifrost event wiring. Application code should keep using native MongoDB `Collection<T>`, `FindCursor<T>`, sessions, aggregations, and bulk operations directly; Mongoose-only concepts such as hydrated documents, query thenables, implicit middleware, automatic populate, and model statics are deliberately moved into explicit app-level functions or omitted.

**Tech Stack:** TypeScript, Bun, official `mongodb` driver, `bson`/driver `ObjectId`, Zod, Bifrost server events/channels, TC39 Stage 3 decorators, Vitest, Cortex, and the existing Bifrost package export/build pipeline.

**Delegation Strategy:** Start with one Cortex-first `explorer` sidecar only if the implementer has not already mapped Bifrost's decorator/package surface and ExampleApp's Mongoose usage. The supervisor owns the API boundary and must keep the scope driver-first. Workers may independently implement decorators/metadata, registry/connection, schema/ObjectId helpers, and change-stream bridge because those write scopes are disjoint; verification and review are required because this is a public package surface and a data-layer migration path.

---

## Executive Revision

The first draft was too Mongoose-shaped. It proposed a repository API, query builder, document wrapper, plugin system, and populate layer. That repeats the abstraction that ExampleApp is trying to leave.

The revised plan is stricter:

- `bifrost-mongodb` is not an ORM.
- `bifrost-mongodb` does not wrap the MongoDB driver query API.
- `bifrost-mongodb` does not implement `lean`, `save`, hydrated documents, Mongoose middleware, Mongoose plugins, or automatic `populate`.
- The primary runtime object exposed to applications is `mongodb.Collection<TDocument>`.
- Decorators are used for declarative metadata, not for hiding database behavior.
- ExampleApp migration should simplify the application by replacing Mongoose statics/plugins/hooks with explicit functions and services.
- Any behavior that the native driver already handles should stay in the native driver.

This is the proper fix: remove Mongoose's implicit behavior instead of rebuilding it under a Bifrost name.

## Problem

ExampleApp currently depends on Mongoose for many concerns:

- connection lifecycle
- model registry
- schemas
- indexes
- statics
- instance methods
- hooks and plugins
- default lean behavior
- soft delete filtering
- `populate()`
- change streams
- ObjectId utilities
- raw `collection` escape hatches

Those conveniences now create hidden behavior and make migration hard. Replacing them with a second abstraction that looks like Mongoose would preserve the same operational risks:

- hidden filters
- hidden writes from hooks
- unclear type ownership
- unclear transaction/session propagation
- unexpected query execution
- hard-to-test side effects

The new package should only own the parts where Bifrost adds unique value:

- typed collection registration
- Bifrost server event integration
- change-stream lifecycle management
- schema validation helpers
- index declaration
- ObjectId helpers
- explicit migration helpers

Everything else should remain plain MongoDB driver code.

## Current Reference Surface

The reference application is `<user-home>/Repositories/example-app/example-app`.

Observed Mongoose footprint:

- `43` collection files under `src/server/data/collections`
- `50` schema files under `src/server/data/schemas`
- `200+` TypeScript files with direct Mongoose/model/query usage
- Common APIs: `mongoose.connect`, `mongoose.disconnect`, `mongoose.model`, `mongoose.models`, `mongoose.connection.db.collection`, `mongoose.Collection.watch`, `mongoose.Types.ObjectId`, `Schema`, `model`, `Model`, `HydratedDocument`, `Document`, `QueryWithHelpers`, `QueryFilter`, `UpdateWriteOpResult`
- Common operations: `find`, `findOne`, `findById`, `create`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, `countDocuments`, `distinct`, `aggregate`, `watch`, `.collection.*`, `.lean()`, `.lean(false)`, `.populate()`, `.select()`, `.sort()`, `.limit()`, `.skip()`, `.save()`
- Extensions: soft delete, default lean, find-one-or-create, orderable, compound orderable, add-count, add-computed-field, Meilisearch sync, schema indexes, schema hooks, schema statics, schema instance methods

The migration should convert this surface into explicit driver usage:

- `Model.find(...).lean()` becomes `collection.find(...).toArray()`.
- `Model.findOne(...).lean()` becomes `collection.findOne(...)`.
- `Model.findById(id).lean()` becomes `collection.findOne({ _id: toObjectId(id) })`.
- `query.select('a b')` becomes driver projection `{ projection: { a: 1, b: 1 } }`.
- `query.sort(...).limit(...)` becomes driver cursor chaining.
- `.lean(false)` plus mutation plus `.save()` becomes explicit `updateOne`, `replaceOne`, or a small app-specific helper.
- `populate()` becomes explicit batched reads or `$lookup` aggregation.
- model statics become exported functions in `src/server/data/stores` or service modules.
- instance methods become pure functions accepting a document and dependencies.
- plugins become explicit helper functions or service calls.
- hooks become explicit write paths or Bifrost MongoDB change-stream watchers.

## Stress-Tested Assumptions

### Assumption 1: A repository layer will make migration easier.

**Rejected.** A repository that mirrors Mongoose reduces short-term edits but preserves the same hidden model layer. The MongoDB driver already has a typed collection API. The package should expose native collections and add metadata around them.

### Assumption 2: A query builder is needed to replace Mongoose queries.

**Rejected.** The driver already has `FindCursor<T>` with `project`, `sort`, `limit`, `skip`, `toArray`, and async iteration. A Bifrost query builder would risk double execution, incomplete cursor support, broken session propagation, and more types to maintain.

### Assumption 3: `lean(false)` needs a package-level document wrapper.

**Rejected for version one.** Hydrated documents are a Mongoose escape hatch. ExampleApp should convert those cases to explicit `updateOne`, `replaceOne`, or small app-local helpers where mutation is truly clearer.

### Assumption 4: `populate()` should be recreated.

**Rejected.** Populate hides extra database reads and field exposure. ExampleApp should use explicit batched loaders or `$lookup` pipelines. The package may provide tiny projection and ObjectId utilities, but not automatic relationship loading.

### Assumption 5: Mongoose plugins should become Bifrost MongoDB plugins.

**Rejected for version one.** Mongoose plugins are the primary source of hidden behavior. Convert common patterns into explicit helpers:

- soft delete filter builders
- timestamp update builders
- find-one-or-create helper
- order mutation helper
- Meilisearch sync service
- count recomputation service

### Assumption 6: Schema validation must cover every update operator.

**Rejected.** Full MongoDB update validation is complex and can become wrong. Version one validates inserts and replacements, provides `parseSet` for `$set` payloads, and keeps raw driver updates explicit.

### Assumption 7: Decorators should register behavior-heavy classes.

**Rejected.** Decorators should register metadata-heavy collection definitions. Behavior should be explicit functions that receive native collections.

### Assumption 8: Replacing Mongoose means preserving model statics.

**Rejected.** Statics are just functions attached to a class. They should become named exported functions with explicit dependencies. That improves testability and avoids binding ambiguity.

### Assumption 9: The package should hide MongoDB sessions and transactions.

**Rejected.** Sessions and transactions must remain normal driver concepts. The package can expose `withTransaction`, but must pass through `ClientSession` instead of inventing a transaction abstraction.

### Assumption 10: Bifrost MongoDB should be a ExampleApp-specific compatibility package.

**Rejected.** ExampleApp is the pressure test, not the product boundary. The package should be reusable for any Bifrost server that uses MongoDB and wants real-time events from change streams.

## Revised Public API

### Package Exports

Add these subpath exports to `bifrost-ts/package.json`:

```json
{
  "./mongodb": {
    "types": "./dist/mongodb/index.d.ts",
    "import": "./dist/mongodb/index.js"
  },
  "./mongodb/decorators": {
    "types": "./dist/mongodb/decorators/index.d.ts",
    "import": "./dist/mongodb/decorators/index.js"
  }
}
```

Add the official driver as an optional peer dependency and dev dependency:

```json
{
  "peerDependencies": {
    "mongodb": ">=6"
  },
  "peerDependenciesMeta": {
    "mongodb": {
      "optional": true
    }
  }
}
```

Use `ObjectId` from `mongodb` unless a concrete compatibility issue requires direct `bson` import. Do not add both by default if the driver export is sufficient.

### Decorator Syntax

Decorators describe collection metadata, not a repository class:

```ts
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import {
  MongoCollection,
  MongoIndex,
  MongoSchema,
  MongoWatch,
  createBifrostMongo,
  objectId,
  toObjectId,
  withInsertTimestamps,
  withUpdateTimestamp,
} from '@example-app/bifrost/mongodb'

const BoardSchema = z.object({
  _id: objectId(),
  name: z.string().min(1),
  author: objectId(),
  nodeCount: z.number().int().nonnegative(),
  deletedAt: z.date().optional(),
  deletedBy: objectId().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type Board = z.infer<typeof BoardSchema>

@MongoCollection<Board>('boards')
@MongoSchema(BoardSchema)
@MongoIndex({ author: 1, deletedAt: 1 })
@MongoIndex({ updatedAt: -1 })
@MongoWatch({
  event: 'boards.changed',
  eventOptions: { protected: true },
  getChannel: doc => String(doc.author),
  excludeFields: ['analytics'],
})
class BoardsCollection {}

const mongo = await createBifrostMongo({
  server,
  uri: process.env.DATABASE,
  dbName: 'example-app',
  clientOptions: { authSource: 'admin' },
  collections: [BoardsCollection],
})

export const Boards = mongo.collection<Board>(BoardsCollection)

export async function createBoard(input: {
  name: string
  author: string | ObjectId
}) {
  const board = BoardSchema.parse(
    withInsertTimestamps({
      _id: new ObjectId(),
      name: input.name,
      author: toObjectId(input.author),
      nodeCount: 0,
    }),
  )

  await Boards.insertOne(board)
  return board
}

export async function updateBoardName(id: string | ObjectId, name: string) {
  return Boards.updateOne(
    { _id: toObjectId(id) },
    withUpdateTimestamp({ $set: { name } }),
  )
}
```

The class is a stable collection token. It does not need to extend a base class.

### Runtime API

```ts
interface BifrostMongoOptions {
  server?: Server
  uri?: string
  client?: MongoClient
  db?: Db
  dbName?: string
  clientOptions?: MongoClientOptions
  collections: MongoCollectionClass[]
  ensureIndexes?: boolean
  closeExternalClient?: boolean
}

interface BifrostMongo {
  readonly db: Db
  readonly client: MongoClient | null
  collection<TDocument extends Document>(
    token: MongoCollectionClass,
  ): Collection<TDocument>
  collectionByName<TDocument extends Document>(name: string): Collection<TDocument>
  meta(token: MongoCollectionClass): MongoCollectionDefinition
  ensureIndexes(): Promise<void>
  close(): Promise<void>
}

function createBifrostMongo(options: BifrostMongoOptions): Promise<BifrostMongo>
```

The package should not expose a `MongoRepository`, `MongoQuery`, or `MongoDocument`.

### Schema Helpers

Use Zod helpers for document boundaries:

```ts
function objectId(): z.ZodType<ObjectId>
function coerceObjectId(): z.ZodType<ObjectId>
function toObjectId(value: string | ObjectId): ObjectId
function objectIdHex(value: string | ObjectId): string

function parseInsert<TDocument>(
  schema: z.ZodType<TDocument>,
  input: unknown,
): TDocument

function parseReplacement<TDocument>(
  schema: z.ZodType<TDocument>,
  input: unknown,
): TDocument

function parseSet<TSet extends object>(
  schema: z.ZodType<TSet>,
  input: unknown,
): TSet
```

Use explicit timestamp helpers:

```ts
function withInsertTimestamps<T extends object>(
  input: T,
  now?: Date,
): T & { createdAt: Date; updatedAt: Date }

function withUpdateTimestamp<TUpdate extends Document>(
  update: TUpdate,
  now?: Date,
): TUpdate
```

`withUpdateTimestamp` must preserve existing update operators and add `updatedAt` under `$set`.

### Query Style

Use the official driver directly:

```ts
const boards = await Boards.find(
  active({ author: toObjectId(userId) }),
  { projection: { name: 1, nodeCount: 1, updatedAt: 1 } },
)
  .sort({ updatedAt: -1 })
  .limit(50)
  .toArray()
```

No `lean()` equivalent is needed because the MongoDB driver returns plain objects by default.

No `select()` helper is needed for version one. If projection strings reduce migration noise, add a small pure helper:

```ts
function projection(fields: string): Document
```

Example:

```ts
await Users.findOne(
  { _id: toObjectId(userId) },
  { projection: projection('name email avatar') },
)
```

### Relationship Loading

Do not implement `populate()` in the package. Use explicit app-level functions:

```ts
export async function loadUsersById(
  users: Collection<User>,
  ids: Array<ObjectId>,
) {
  const docs = await users.find({ _id: { $in: ids } }).toArray()
  return new Map(docs.map(doc => [objectIdHex(doc._id), doc]))
}
```

For server methods that need relationship joins, prefer either:

- batched loaders near the method or service that needs them
- MongoDB aggregation with `$lookup` when the database should perform the join

This makes data exposure explicit at the call site.

### Soft Delete

Do not hide soft delete through implicit query middleware.

Use pure filter helpers:

```ts
type SoftDeleted = {
  deletedAt?: Date | null
}

function active<TFilter extends Document>(filter: TFilter): TFilter & {
  deletedAt: null
}

function includeDeleted<TFilter extends Document>(filter: TFilter): TFilter

function markDeleted(userId: string | ObjectId, now?: Date): UpdateFilter<SoftDeleted>

function markRestored(): UpdateFilter<SoftDeleted>
```

Example:

```ts
await Boards.find(active({ author: toObjectId(userId) })).toArray()

await Boards.updateOne(
  { _id: toObjectId(boardId) },
  markDeleted(client.userId),
)
```

This is more verbose than Mongoose middleware and intentionally safer.

### Find-Or-Create

Do not implement model statics. Provide a pure helper:

```ts
async function findOneOrCreate<TDocument extends Document>(
  collection: Collection<TDocument>,
  filter: Filter<TDocument>,
  create: OptionalUnlessRequiredId<TDocument>,
  options?: { session?: ClientSession },
): Promise<TDocument>
```

Implementation should use `findOneAndUpdate` with `$setOnInsert` and `upsert: true` when possible.

### Change Stream API

This is the package's main behavior layer.

```ts
@MongoWatch({
  event: 'boardNodes.changed',
  eventOptions: { protected: true },
  getChannel: doc => String(doc.board),
  excludeFields: ['analytics'],
  fullDocument: 'updateLookup',
})
class BoardNodesCollection {}
```

Responsibilities:

- call `server.addEvent(event, eventOptions)`
- open `collection.watch()`
- emit through `server.channel(channel).emit(event, payload)`
- include `eventId`, `_id`, `doc`, and `deleted`
- skip updates that only touch `updatedAt`
- skip updates where all changed fields are excluded
- resume after transient failures
- close watchers through `mongo.close()`

Payload:

```ts
type MongoWatchPayload<TDocument> = {
  eventId: string
  _id: ObjectId
  doc: TDocument | null
  deleted: boolean
}
```

### Transactions And Sessions

Keep driver semantics:

```ts
await mongo.client?.withSession(async session => {
  await session.withTransaction(async () => {
    await Boards.updateOne(filter, update, { session })
    await BoardNodes.updateMany(nodeFilter, nodeUpdate, { session })
  })
})
```

The package may expose a small `withTransaction` helper later, but version one should not hide `ClientSession`.

## File Structure

Create these Bifrost files:

- `bifrost-ts/src/mongodb/index.ts` — public exports for runtime, decorators, schema helpers, filter helpers, timestamp helpers, watch payload types
- `bifrost-ts/src/mongodb/client.ts` — create or bind MongoDB `MongoClient`/`Db`
- `bifrost-ts/src/mongodb/registry.ts` — register collection metadata, return native collections, ensure indexes, own watcher lifecycle, close owned resources
- `bifrost-ts/src/mongodb/schema.ts` — ObjectId helpers, Zod helpers, insert/replacement/set parsing
- `bifrost-ts/src/mongodb/timestamps.ts` — explicit insert/update timestamp helpers
- `bifrost-ts/src/mongodb/filters.ts` — soft delete and projection helpers
- `bifrost-ts/src/mongodb/find-one-or-create.ts` — pure helper around native driver
- `bifrost-ts/src/mongodb/change-streams.ts` — resilient watch wrapper and Bifrost event bridge
- `bifrost-ts/src/mongodb/decorators/index.ts` — decorator exports
- `bifrost-ts/src/mongodb/decorators/metadata.ts` — WeakMap metadata stores modeled after server decorator metadata
- `bifrost-ts/src/mongodb/decorators/collection.ts` — `@MongoCollection`, `@MongoSchema`, `@MongoIndex`
- `bifrost-ts/src/mongodb/decorators/watch.ts` — `@MongoWatch`
- `bifrost-ts/src/mongodb/decorators/register.ts` — metadata reader and validation utilities

Do not create these files in version one:

- `bifrost-ts/src/mongodb/query.ts`
- `bifrost-ts/src/mongodb/document.ts`
- `bifrost-ts/src/mongodb/populate.ts`
- `bifrost-ts/src/mongodb/plugins.ts`
- `bifrost-ts/src/mongodb/collection.ts` as a repository abstraction

Create these tests:

- `bifrost-ts/src/mongodb/index.unit.spec.ts`
- `bifrost-ts/src/mongodb/decorators.unit.spec.ts`
- `bifrost-ts/src/mongodb/registry.unit.spec.ts`
- `bifrost-ts/src/mongodb/schema.unit.spec.ts`
- `bifrost-ts/src/mongodb/timestamps.unit.spec.ts`
- `bifrost-ts/src/mongodb/filters.unit.spec.ts`
- `bifrost-ts/src/mongodb/find-one-or-create.unit.spec.ts`
- `bifrost-ts/src/mongodb/change-streams.unit.spec.ts`
- `bifrost-ts/src/mongodb/change-streams.integration.spec.ts`
- `bifrost-ts/src/mongodb/driver-parity.integration.spec.ts`

Modify these existing files:

- `bifrost-ts/package.json` — add subpath exports and optional peer dependency
- `bifrost-ts/scripts/prepare-dist.mjs` — modify only if generated nested `dist/mongodb` imports fail ESM resolution
- `bifrost-ts/src/ejson/mongoose.unit.spec.ts` — keep ObjectId/EJSON behavior covered; rename only if Mongoose wording becomes misleading

Create this decision after implementation:

- `decisions/YYYY-MM-DD-bifrost-mongodb-driver-first-registry.md`

## Implementation Tasks

### Task 1: Confirm Scope And Existing Extension Points

**Files:**
- Read: `bifrost-ts/src/server/decorators/*`
- Read: `bifrost-ts/package.json`
- Read: `bifrost-ts/src/server/server-channel.ts`
- Read: `bifrost-ts/src/server/event.ts`
- Read: `bifrost-ts/src/server/server.ts`
- Read: `<user-home>/Repositories/example-app/example-app/src/server/data/change-streams.ts`
- Read: `<user-home>/Repositories/example-app/example-app/src/server/data/plugins/*.ts`

**Execution:**
- Owner: `supervisor`
- Support: `explorer`
- Risk: `low`
- Verification: Cortex `graph_context`, targeted file reads, and a written note confirming no repository/query/document abstraction will be implemented

- [ ] **Step 1: Dispatch a Cortex-first explorer if context is stale**

  Ask the explorer for exact files, symbols, current Bifrost decorator patterns, package export patterns, ExampleApp Mongoose behaviors, and risks. Stop if it recommends broad exploratory edits.

- [ ] **Step 2: Confirm the driver-first rule**

  Record these exclusions in the working checklist before implementation:

  ```txt
  no MongoRepository
  no MongoQuery
  no MongoDocument
  no populate
  no plugin system
  no Mongoose compatibility layer
  ```

- [ ] **Step 3: Verify current baseline**

  Run:

  ```sh
  cd bifrost-ts
  bun run build
  ```

  Expected: current build passes before MongoDB work starts. If it fails before edits, record the failure separately and do not mix unrelated fixes into this work.

### Task 2: Add Package Surface

**Files:**
- Create: `bifrost-ts/src/mongodb/index.ts`
- Create: `bifrost-ts/src/mongodb/decorators/index.ts`
- Modify: `bifrost-ts/package.json`
- Test: `bifrost-ts/src/mongodb/index.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: targeted unit test, `bun run typecheck`, `bun run build`

- [ ] **Step 1: Write export smoke test**

  Test that `createBifrostMongo`, `objectId`, `toObjectId`, `withInsertTimestamps`, `active`, `findOneOrCreate`, `MongoCollection`, `MongoSchema`, `MongoIndex`, and `MongoWatch` are exported.

- [ ] **Step 2: Add minimal exported functions**

  Add real minimal implementations that throw specific configuration errors where runtime input is required. Do not add placeholders that look usable.

- [ ] **Step 3: Add package exports**

  Add `./mongodb` and `./mongodb/decorators` to `bifrost-ts/package.json`.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/index.unit.spec.ts
  bun run typecheck
  bun run build
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/package.json bifrost-ts/src/mongodb
  git commit -m "feat: add mongodb package surface"
  ```

### Task 3: Implement Decorator Metadata

**Files:**
- Create: `bifrost-ts/src/mongodb/decorators/metadata.ts`
- Create: `bifrost-ts/src/mongodb/decorators/collection.ts`
- Create: `bifrost-ts/src/mongodb/decorators/watch.ts`
- Create: `bifrost-ts/src/mongodb/decorators/register.ts`
- Modify: `bifrost-ts/src/mongodb/decorators/index.ts`
- Test: `bifrost-ts/src/mongodb/decorators.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: decorator tests and `bun run typecheck`

- [ ] **Step 1: Write decorator tests**

  Cover:

  - `@MongoCollection` stores collection name.
  - `@MongoSchema` stores Zod schema.
  - `@MongoIndex` appends index definitions.
  - `@MongoWatch` appends watcher definitions.
  - Multiple decorators on one class compose.
  - Same-file classes do not leak metadata.
  - Classes missing `@MongoCollection` fail registration validation.

- [ ] **Step 2: Implement metadata**

  Use WeakMaps keyed by class constructor. Do not use `reflect-metadata`.

  ```ts
  export interface MongoCollectionDefinition<TDocument extends Document = Document> {
    token: MongoCollectionClass
    name: string
    schema?: z.ZodType<TDocument>
    indexes: MongoIndexDefinition[]
    watches: MongoWatchDefinition<TDocument>[]
  }
  ```

- [ ] **Step 3: Implement decorators**

  Keep decorators data-only. They must not open database connections, create indexes, or start watchers.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/decorators.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/decorators bifrost-ts/src/mongodb/decorators.unit.spec.ts
  git commit -m "feat: declare mongodb collection metadata"
  ```

### Task 4: Implement Registry And Native Collection Access

**Files:**
- Create: `bifrost-ts/src/mongodb/client.ts`
- Create: `bifrost-ts/src/mongodb/registry.ts`
- Modify: `bifrost-ts/src/mongodb/index.ts`
- Test: `bifrost-ts/src/mongodb/registry.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: mocked driver unit tests, `bun run typecheck`, `bun run build`

- [ ] **Step 1: Write registry tests**

  Cover:

  - accepts existing `Db`
  - accepts existing `MongoClient`
  - accepts URI plus `clientOptions`
  - returns native `Collection<T>` from `collection(token)`
  - returns native `Collection<T>` from `collectionByName(name)`
  - exposes metadata through `meta(token)`
  - creates indexes only through `ensureIndexes()`
  - optionally runs `ensureIndexes()` during startup when configured
  - closes owned client
  - does not close external client unless `closeExternalClient` is true

- [ ] **Step 2: Implement connection resolution**

  Resolve exactly one of `db`, `client`, or `uri`. Throw clear errors for invalid combinations.

- [ ] **Step 3: Implement native collection registry**

  Store metadata and collection instances. Return `mongodb.Collection<TDocument>` directly.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/registry.unit.spec.ts
  bun run typecheck
  bun run build
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/client.ts bifrost-ts/src/mongodb/registry.ts bifrost-ts/src/mongodb/index.ts bifrost-ts/src/mongodb/registry.unit.spec.ts
  git commit -m "feat: register native mongodb collections"
  ```

### Task 5: Implement ObjectId And Schema Helpers

**Files:**
- Create: `bifrost-ts/src/mongodb/schema.ts`
- Test: `bifrost-ts/src/mongodb/schema.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: schema unit tests and `bun run typecheck`

- [ ] **Step 1: Write helper tests**

  Cover:

  - `objectId()` accepts driver `ObjectId`
  - `objectId()` rejects strings
  - `coerceObjectId()` accepts valid strings and `ObjectId`
  - `coerceObjectId()` rejects invalid strings
  - `toObjectId()` normalizes strings and preserves ObjectIds
  - `objectIdHex()` returns stable hex strings
  - `parseInsert()` runs Zod parse
  - `parseReplacement()` runs Zod parse
  - `parseSet()` validates only a supplied `$set` payload schema

- [ ] **Step 2: Implement helpers**

  Keep helpers pure and independent of Bifrost server state.

- [ ] **Step 3: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/schema.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 4: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/schema.ts bifrost-ts/src/mongodb/schema.unit.spec.ts
  git commit -m "feat: add mongodb schema helpers"
  ```

### Task 6: Implement Timestamp, Filter, Projection, And Find-Or-Create Helpers

**Files:**
- Create: `bifrost-ts/src/mongodb/timestamps.ts`
- Create: `bifrost-ts/src/mongodb/filters.ts`
- Create: `bifrost-ts/src/mongodb/find-one-or-create.ts`
- Modify: `bifrost-ts/src/mongodb/index.ts`
- Test: `bifrost-ts/src/mongodb/timestamps.unit.spec.ts`
- Test: `bifrost-ts/src/mongodb/filters.unit.spec.ts`
- Test: `bifrost-ts/src/mongodb/find-one-or-create.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: helper unit tests and `bun run typecheck`

- [ ] **Step 1: Write timestamp tests**

  Cover:

  - insert timestamps set `createdAt` and `updatedAt`
  - caller can inject `now` for deterministic tests
  - update timestamp preserves existing `$set`
  - update timestamp does not remove `$inc`, `$unset`, or other operators

- [ ] **Step 2: Write filter/projection tests**

  Cover:

  - `active({ author })` adds `deletedAt: null`
  - `active({ deletedAt: explicit })` rejects conflicting filters
  - `markDeleted(userId)` sets `deletedAt` and `deletedBy`
  - `markRestored()` unsets soft delete fields
  - `projection('name email')` returns `{ name: 1, email: 1 }`

- [ ] **Step 3: Write find-one-or-create tests**

  Mock collection `findOneAndUpdate` and verify `$setOnInsert`, `upsert: true`, `returnDocument: 'after'`, and session option forwarding.

- [ ] **Step 4: Implement helpers**

  These helpers must not patch collection methods or add hidden behavior.

- [ ] **Step 5: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/timestamps.unit.spec.ts src/mongodb/filters.unit.spec.ts src/mongodb/find-one-or-create.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 6: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/timestamps.ts bifrost-ts/src/mongodb/filters.ts bifrost-ts/src/mongodb/find-one-or-create.ts bifrost-ts/src/mongodb/index.ts bifrost-ts/src/mongodb/*.unit.spec.ts
  git commit -m "feat: add explicit mongodb write helpers"
  ```

### Task 7: Implement Bifrost Change Stream Bridge

**Files:**
- Create: `bifrost-ts/src/mongodb/change-streams.ts`
- Modify: `bifrost-ts/src/mongodb/registry.ts`
- Modify: `bifrost-ts/src/mongodb/index.ts`
- Test: `bifrost-ts/src/mongodb/change-streams.unit.spec.ts`
- Test: `bifrost-ts/src/mongodb/change-streams.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier` and `reviewer`
- Risk: `high`
- Verification: unit tests, integration tests, typecheck, and reviewer pass

- [ ] **Step 1: Write watcher unit tests**

  Cover:

  - watcher registers Bifrost event through `server.addEvent`
  - insert emits `{ eventId, _id, doc, deleted: false }`
  - update emits current full document
  - delete emits `{ doc: null, deleted: true }`
  - update containing only `updatedAt` is skipped
  - update containing only excluded fields is skipped
  - `getChannel` may return one channel or many channels
  - close prevents reconnect scheduling

- [ ] **Step 2: Write integration test**

  Use a real MongoDB test database when available. If replica-set change streams are unavailable, skip with a clear diagnostic and keep unit coverage mandatory.

- [ ] **Step 3: Implement resilient watcher**

  Port ExampleApp's current behavior without importing Mongoose. Use native `collection.watch()` and store close handles in the registry.

- [ ] **Step 4: Wire registry startup and shutdown**

  When a registered collection has watch metadata and a server is configured, start watchers after collection registration and close them through `mongo.close()`.

- [ ] **Step 5: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/change-streams.unit.spec.ts
  bun run test:integration -- src/mongodb/change-streams.integration.spec.ts
  bun run typecheck
  ```

- [ ] **Step 6: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/change-streams.ts bifrost-ts/src/mongodb/change-streams*.spec.ts bifrost-ts/src/mongodb/registry.ts bifrost-ts/src/mongodb/index.ts
  git commit -m "feat: stream mongodb changes through bifrost"
  ```

### Task 8: Add Driver-Parity Integration Tests

**Files:**
- Create: `bifrost-ts/src/mongodb/driver-parity.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: integration tests and typecheck

- [ ] **Step 1: Test native driver workflows**

  Cover:

  - `collection.find(...).project(...).sort(...).limit(...).toArray()`
  - `collection.findOne(...)`
  - `collection.findOneAndUpdate(...)`
  - `collection.updateOne(...)`
  - `collection.aggregate(...)`
  - `collection.bulkWrite(...)`
  - session option forwarding through helper functions
  - index creation through `ensureIndexes()`

- [ ] **Step 2: Test ExampleApp migration examples**

  Cover:

  - replacing `.lean()` with direct driver reads
  - replacing `.lean(false).save()` with explicit `updateOne`
  - replacing `.populate()` with batched loader
  - replacing soft-delete middleware with `active()` filter
  - replacing model static with exported helper function

- [ ] **Step 3: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:integration -- src/mongodb/driver-parity.integration.spec.ts
  bun run typecheck
  bun run build
  ```

- [ ] **Step 4: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/driver-parity.integration.spec.ts
  git commit -m "test: cover driver-first mongodb workflows"
  ```

### Task 9: Document Design And Decision

**Files:**
- Create: `bifrost-ts/src/mongodb/README.md` if package-local docs are accepted by the repo
- Create: `decisions/YYYY-MM-DD-bifrost-mongodb-driver-first-registry.md`
- Modify: `RELEASING.md` if optional peer dependency or package export release steps change

**Execution:**
- Owner: `supervisor`
- Support: `reviewer`
- Risk: `medium`
- Verification: doc review and `bun run build`

- [ ] **Step 1: Document driver-first usage**

  Include:

  - connection setup
  - collection decorators
  - native collection access
  - schema helpers
  - timestamp helpers
  - soft delete helpers
  - find-one-or-create helper
  - change-stream events
  - explicit relationship loading
  - migration examples from common Mongoose patterns

- [ ] **Step 2: Write decision record**

  Record why the package does not implement repositories, query builders, document wrappers, populate, or plugin systems.

- [ ] **Step 3: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run build
  ```

- [ ] **Step 4: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/README.md decisions/YYYY-MM-DD-bifrost-mongodb-driver-first-registry.md RELEASING.md
  git commit -m "docs: explain driver-first mongodb integration"
  ```

### Task 10: Full Verification And Release-Surface Review

**Files:**
- Analyze all changed Bifrost files

**Execution:**
- Owner: `supervisor`
- Support: `verifier` and `reviewer`
- Risk: `high`
- Verification: full Bifrost checks plus Cortex regression risk report

- [ ] **Step 1: Run focused checks**

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb
  bun run test:integration -- src/mongodb
  bun run typecheck
  bun run build
  ```

- [ ] **Step 2: Run full checks**

  ```sh
  cd bifrost-ts
  bun run test
  bun run lint
  ```

- [ ] **Step 3: Run Cortex risk report**

  Use `regression_risk_report` on changed MongoDB package files, `bifrost-ts/package.json`, and any release/build files.

- [ ] **Step 4: Inspect dist declarations**

  ```sh
  cd bifrost-ts
  find dist/mongodb -name '*.d.ts' -maxdepth 3 -print
  ```

  Confirm consumers can import from `@example-app/bifrost/mongodb` and `@example-app/bifrost/mongodb/decorators` without source aliases.

- [ ] **Step 5: Commit verification fixes**

  ```sh
  git add bifrost-ts/src/mongodb bifrost-ts/package.json bifrost-ts/scripts bifrost-ts/tsconfig*.json RELEASING.md decisions
  git commit -m "fix: harden mongodb package release surface"
  ```

## ExampleApp Migration Strategy

The migration should simplify ExampleApp rather than preserve Mongoose structure.

### Migration Principle 1: Collections Are Native

Current:

```ts
export const BoardCollection = model<Board, SoftDeleteModel<BoardModel>>(
  ColName.Boards,
  BoardSchema,
)
```

Target:

```ts
@MongoCollection<Board>(ColName.Boards)
@MongoSchema(BoardSchema)
@MongoIndex({ author: 1, deletedAt: 1 })
class BoardsCollection {}

export const BoardCollection = mongo.collection<Board>(BoardsCollection)
```

### Migration Principle 2: Statics Become Functions

Current:

```ts
BoardSchema.statics.updateDiskUsage = async function (boardId, bytes) {
  return this.updateOne({ _id: boardId }, { diskUsage: bytes })
}
```

Target:

```ts
export async function updateBoardDiskUsage(
  boards: Collection<Board>,
  boardId: ObjectId,
  bytes: number,
  options?: { session?: ClientSession },
) {
  return boards.updateOne(
    { _id: boardId },
    withUpdateTimestamp({ $set: { diskUsage: bytes } }),
    options,
  )
}
```

### Migration Principle 3: Hooks Become Explicit Write Paths

Current:

```ts
schema.post('save', syncMeilisearch)
```

Target:

```ts
export async function saveBoardNodeAndSyncSearch(input: SaveBoardNodeInput) {
  const result = await BoardNodes.updateOne(input.filter, input.update)
  await syncBoardNodeToSearch(input.nodeId)
  return result
}
```

Use change streams only when the side effect truly should follow all writes to the collection.

### Migration Principle 4: Populate Becomes Batched Loading

Current:

```ts
const roles = await RoleCollection.find({ org }).populate('user', 'name email')
```

Target:

```ts
const roles = await Roles.find({ org }).toArray()
const usersById = await loadUsersById(
  Users,
  roles.map(role => role.user),
  projection('name email'),
)

return roles.map(role => ({
  ...role,
  user: usersById.get(objectIdHex(role.user)) ?? null,
}))
```

### Migration Principle 5: Hydrated Documents Become Direct Updates

Current:

```ts
const user = await UserCollection.findById(userId).lean(false)
user.name = name
await user.save()
```

Target:

```ts
await Users.updateOne(
  { _id: toObjectId(userId) },
  withUpdateTimestamp({ $set: { name } }),
)
```

### Migration Principle 6: Plugins Become Small Helpers Or Services

Migrate patterns as follows:

- soft delete plugin -> `active`, `markDeleted`, `markRestored`
- lean plugin -> remove; driver returns plain objects
- find-one-or-create plugin -> `findOneOrCreate(collection, filter, create)`
- orderable plugin -> explicit order service functions
- add-count extender -> explicit count recomputation service or change-stream consumer
- add-computed-field extender -> explicit write helper or background recomputation
- Meilisearch plugin -> explicit sync service or change-stream consumer

### Migration Tasks

1. Replace connection setup with `createBifrostMongo`.
2. Convert collection exports to decorated collection tokens returning native collections.
3. Convert schemas to Zod document contracts where runtime validation is useful.
4. Replace simple `.lean()` reads with native driver reads.
5. Replace `.lean(false).save()` with explicit updates.
6. Convert statics to exported functions.
7. Convert populate sites to batched loaders or `$lookup`.
8. Convert soft delete to explicit filter/update helpers.
9. Convert hooks/plugins to explicit write services or change-stream consumers.
10. Replace raw `mongoose.connection.db.collection` with `mongo.db.collection`.
11. Replace `mongoose.Types.ObjectId` with driver `ObjectId`.
12. Remove Mongoose only after `rg "mongoose|HydratedDocument|Schema|Model|QueryWithHelpers" src` is clean.

## Praemeditatio Malorum: Revised Failure Modes

### 1. The Package Rebuilds Mongoose Anyway

**Failure:** Implementation adds repository/query/document/populate/plugin abstractions despite this revision.

**Symptoms:**

- New files named `query.ts`, `document.ts`, `populate.ts`, or `plugins.ts`.
- Public types include `MongoRepository`, `MongoQuery`, or `MongoDocument`.
- ExampleApp migration examples keep `.lean()`, `.save()`, or `.populate()` semantics.

**Prevention:**

- Treat those names as scope violations for version one.
- Return native `Collection<T>` from the registry.
- Keep migration helpers as pure functions over driver collections.

**Recovery:**

- Delete the abstraction before it becomes part of published API.
- Move any necessary app-specific helper into ExampleApp, not Bifrost.

### 2. Driver Types Are Wrapped Until They Lose Value

**Failure:** The package hides `Collection<T>`, `FindCursor<T>`, `ClientSession`, or driver options behind weaker local types.

**Symptoms:**

- Consumers cannot pass normal MongoDB options.
- Transactions require package-specific concepts.
- Aggregation and bulk operations need escape hatches.

**Prevention:**

- Export and accept driver types directly.
- Keep helper functions generic over `Collection<T>`.
- Do not retype the driver API.

**Recovery:**

- Replace local wrapper types with imports from `mongodb`.
- Convert package-specific options to driver option passthroughs.

### 3. Decorators Become Runtime Behavior Containers

**Failure:** Decorators open connections, mutate collections, start watchers immediately, or bind methods.

**Symptoms:**

- Importing a collection definition has side effects.
- Tests become order-dependent.
- Application startup behavior depends on module import order.

**Prevention:**

- Decorators only write metadata.
- `createBifrostMongo` is the only runtime registration entry point.
- Tests assert decorators do not touch the driver.

**Recovery:**

- Move side effects into registry startup.
- Make decorator modules metadata-only again.

### 4. Schema Validation Pretends To Prove All Updates

**Failure:** Update validation gives false confidence and rejects valid MongoDB update operators or misses invalid nested updates.

**Symptoms:**

- `$inc`, `$unset`, array filters, or pipeline updates fail unexpectedly.
- Complex updates bypass validation anyway.

**Prevention:**

- Validate inserts and replacements.
- Offer `parseSet` for explicit `$set` validation.
- Keep complex updates as driver-owned behavior.

**Recovery:**

- Remove broad update validation.
- Add narrow app-level Zod parsers for high-risk write inputs.

### 5. Soft Delete Becomes Hidden Middleware Again

**Failure:** The package automatically changes every read filter.

**Symptoms:**

- Migrations cannot find deleted data.
- Counts disagree with raw collection results.
- Developers do not know whether a query includes deleted records.

**Prevention:**

- Use explicit `active(filter)` and `markDeleted(userId)` helpers.
- Do not patch `find`, `findOne`, or `countDocuments`.

**Recovery:**

- Remove implicit filters.
- Replace call sites with explicit helpers.

### 6. Relationship Loading Reintroduces Implicit Data Exposure

**Failure:** A package-level populate helper returns fields that should stay private.

**Symptoms:**

- Token hashes, billing fields, passkey internals, or private profile data appear in responses.
- A server method's data exposure is no longer visible locally.

**Prevention:**

- Do not implement package-level populate.
- Use explicit projection at each batched loader or `$lookup`.

**Recovery:**

- Delete generic populate helper.
- Add per-domain loaders with tests for returned fields.

### 7. Change Streams Leak Or Reconnect After Shutdown

**Failure:** Watchers keep timers or streams alive after server/test shutdown.

**Symptoms:**

- Vitest hangs.
- Reconnect logs continue after `mongo.close()`.
- The process remains alive after server close.

**Prevention:**

- Registry owns all watcher close handles.
- Reconnect loops check a closed flag.
- Close streams before closing owned clients.

**Recovery:**

- Add a watcher kill switch.
- Add tests that close during reconnect delay.

### 8. Change Streams Become The New Hidden Hook System

**Failure:** App logic relies on watchers for critical writes that should be explicit and transactional.

**Symptoms:**

- Search/count/billing side effects lag or run out of order.
- Tests need sleeps to observe consistency.
- Transactional workflows are split across asynchronous watchers.

**Prevention:**

- Use watchers for client notifications and eventually consistent side effects.
- Use explicit service functions for critical write-side invariants.

**Recovery:**

- Move critical side effects back into the write path.
- Keep watcher payloads for UI refresh only.

### 9. Index Creation Blocks Startup

**Failure:** Startup waits on slow index creation or fails because index reconciliation is destructive.

**Symptoms:**

- Server readiness is delayed.
- Production deployment fails while creating indexes.

**Prevention:**

- `ensureIndexes()` is explicit.
- Automatic index creation is opt-in.
- Never drop indexes automatically.

**Recovery:**

- Disable startup index creation.
- Move index work to migrations/deployment.

### 10. Optional MongoDB Dependency Loads In Browser Bundles

**Failure:** Non-MongoDB Bifrost imports require `mongodb` at runtime.

**Symptoms:**

- Client/react/lit consumers fail bundling.
- Browser bundle includes MongoDB driver code.

**Prevention:**

- Keep MongoDB imports under `src/mongodb`.
- Do not export MongoDB symbols from root package exports.
- Use subpath-only runtime loading.

**Recovery:**

- Move eager imports behind the MongoDB subpath.
- Add import smoke tests for non-MongoDB subpaths.

### 11. ExampleApp Migration Leaves Mixed Data Layers

**Failure:** Mongoose and Bifrost MongoDB coexist long enough to create inconsistent lifecycle behavior.

**Symptoms:**

- Two clients connect to the same database.
- Tests clean one registry but not the other.
- Change streams are split between Mongoose and native driver.

**Prevention:**

- Migrate connection first, then simple collections, then complex collections.
- Keep commits small but the rollout direct.
- Use `rg` as a hard removal gate.

**Recovery:**

- Close both clients in teardown until migration is complete.
- Do not remove Mongoose until all imports are gone.

### 12. Auth/Session Semantics Drift

**Failure:** Removing Mongoose changes session revocation, OAuth token, passkey, or JWT-related persistence behavior.

**Symptoms:**

- Revoked sessions remain active.
- OAuth authorization codes or refresh tokens do not expire.
- Passkey challenges are not cleaned up.

**Prevention:**

- Preserve TTL indexes explicitly.
- Add focused auth/session migration tests.
- Keep Bifrost `disconnectUser` behavior unchanged.

**Recovery:**

- Pause broader migration.
- Fix auth/session collections before continuing.

### 13. External Side Effects Drift

**Failure:** Meilisearch, counts, computed fields, file cleanup, or billing writes previously handled by hooks/plugins stop running.

**Symptoms:**

- Search index is stale.
- Board counts drift.
- Computed fields are stale.
- Billing state writes are incomplete.

**Prevention:**

- Inventory every side-effect plugin before migration.
- Convert critical side effects to explicit services.
- Use watchers only for eventually consistent side effects.

**Recovery:**

- Add reconciliation jobs for affected systems.
- Re-run sync jobs after deployment.

### 14. Migrations Lose Native Bulk Semantics

**Failure:** Historical migrations are rewritten through helper abstractions and lose exact MongoDB behavior.

**Symptoms:**

- `$rename`, `$unset`, array filters, pipeline updates, or bulk writes behave differently.
- Migration tests fail on older data shapes.

**Prevention:**

- Keep migrations on `mongo.db.collection(...)` or `collection.bulkWrite(...)`.
- Do not schema-validate historical migration writes by default.

**Recovery:**

- Revert migrations to native driver calls.
- Add migration-specific tests.

### 15. Event Payload Shape Breaks Existing Bifrost Clients

**Failure:** Watch payloads differ from ExampleApp's current `{ eventId, _id, doc, deleted }` shape.

**Symptoms:**

- Subscribed clients stop refreshing.
- Delete events are treated as updates.
- Client deduplication fails.

**Prevention:**

- Preserve payload shape in watcher tests.
- Add integration test that subscribes through Bifrost.

**Recovery:**

- Add a compatibility payload adapter before emitting.
- Version additive payload fields only.

### 16. Protocol Governance Is Accidentally Violated

**Failure:** MongoDB work changes Bifrost wire protocol, EJSON tags, default methods, cache keys, or message envelopes.

**Symptoms:**

- Python/Rust conformance tests fail.
- Existing clients cannot decode events.

**Prevention:**

- Keep MongoDB events as normal Bifrost event params.
- Do not change protocol utilities.
- Update `PROTOCOL.md` in the same commit if a protocol change becomes unavoidable.

**Recovery:**

- Revert protocol changes.
- Add conformance fixtures for intentional changes.

### 17. Performance Regresses From Over-Validation

**Failure:** Every read or large bulk write gets parsed through Zod.

**Symptoms:**

- Board load and node operations slow down.
- High-volume jobs consume extra CPU.

**Prevention:**

- Validate inputs at boundaries and writes where useful.
- Do not parse every driver read by default.
- Keep bulk operations native.

**Recovery:**

- Remove read parsing.
- Add explicit validation only around high-risk writes.

### 18. Release Surface Breaks Consumers

**Failure:** `dist/mongodb` declarations or ESM output do not resolve through package exports.

**Symptoms:**

- ExampleApp needs source aliases into `node_modules/@example-app/bifrost/src`.
- Node cannot import the built subpath.

**Prevention:**

- Run `bun run build`.
- Inspect generated `dist/mongodb`.
- Treat source aliases as release blockers.

**Recovery:**

- Fix exports or `prepare-dist.mjs` before publishing.
- Bump package version before retrying an immutable publish.

### 19. Change Stream Tests Depend On Unavailable Replica Sets

**Failure:** Integration tests assume MongoDB change streams are available, but the local or CI MongoDB instance is standalone.

**Symptoms:**

- Change stream integration tests fail with topology errors.
- CI failures look like product regressions when the environment is the problem.
- Developers skip the entire MongoDB test suite because one watcher test is fragile.

**Prevention:**

- Keep watcher unit tests mandatory with mocked native streams.
- Detect replica-set support before running change-stream integration tests.
- Skip only the integration watcher test with a precise diagnostic when replica-set support is absent.
- Document the replica-set requirement in the package README.

**Recovery:**

- Add a CI setup step for a single-node replica set.
- Keep the unit tests as the correctness floor until CI topology is fixed.

### 20. Raw Driver Writes Drift Away From Schema Contracts

**Failure:** Because native collections are primary, application code can bypass Zod helpers and write malformed data.

**Symptoms:**

- Required fields are missing after migrations or bulk jobs.
- Timestamps are inconsistent.
- Client code receives shapes that no longer match shared TypeScript types.

**Prevention:**

- Validate at application input boundaries and high-risk write helpers.
- Use named write functions for domain invariants rather than writing inline everywhere.
- Keep migrations native, but add post-migration assertions for required fields.

**Recovery:**

- Add collection-specific audit scripts.
- Backfill malformed documents through explicit migrations.
- Add Zod parsing at the service boundary that produced bad writes.

### 21. ObjectId And EJSON Compatibility Drifts

**Failure:** Moving from Mongoose `Types.ObjectId` to driver `ObjectId` changes serialization, equality checks, channel names, or EJSON handling.

**Symptoms:**

- Bifrost events use inconsistent channel IDs.
- Existing ObjectId EJSON tests fail.
- Equality checks compare object identity instead of hex strings.
- Client payloads receive ObjectIds in an unexpected shape.

**Prevention:**

- Centralize `toObjectId` and `objectIdHex`.
- Keep existing EJSON ObjectId tests passing.
- Use `objectIdHex(id)` for map keys and Bifrost channel names.
- Add migration tests that compare Mongoose-era fixture IDs with driver ObjectIds.

**Recovery:**

- Add an ObjectId compatibility adapter at serialization boundaries.
- Normalize channel names and map keys to hex strings everywhere.

### 22. Watch Channel Authorization Is Incorrect

**Failure:** `@MongoWatch` emits sensitive document changes on channels that unauthorized clients can subscribe to.

**Symptoms:**

- A user can subscribe to another user's document changes.
- Event options are omitted or too permissive.
- `getChannel` uses a public field when it should use owner/org/user context.

**Prevention:**

- Require explicit `eventOptions` for every watcher in strict mode.
- Prefer user/org IDs as channels for sensitive collections.
- Add tests for protected and user-scoped subscriptions.
- Audit watcher definitions during ExampleApp migration.

**Recovery:**

- Disable the unsafe watcher.
- Re-emit only on authorized channels.
- Add Bifrost subscription authorization tests before reenabling.

### 23. Explicit Services Duplicate Business Rules

**Failure:** Replacing statics/plugins with explicit functions creates several similar helpers that drift apart.

**Symptoms:**

- Two write paths update the same collection with different timestamp, validation, or side-effect behavior.
- One service syncs search and another forgets.
- Callers cannot tell which helper is authoritative.

**Prevention:**

- Name one service function as the authoritative write path for each invariant-heavy operation.
- Keep low-level collection exports simple and put business writes in service modules.
- Add tests around services, not only around helper functions.

**Recovery:**

- Consolidate duplicate helpers into one service.
- Add lint or import-boundary guidance if direct collection writes are unsafe in a domain.

### 24. Sessions Are Dropped By Helper Functions

**Failure:** Pure helpers like `findOneOrCreate`, timestamped updates, or service functions forget to accept and pass through `ClientSession`.

**Symptoms:**

- Some writes escape transactions.
- Tests pass outside transactions and fail under transaction workflows.
- Rollbacks leave partially written documents.

**Prevention:**

- Any helper that performs I/O accepts `{ session?: ClientSession }`.
- Any helper that only builds data must not accept session options.
- Add tests that assert session option forwarding.

**Recovery:**

- Patch helper signatures before broad migration.
- Audit transaction-sensitive ExampleApp paths for direct session forwarding.

### 25. Driver Version Or Module Format Breaks Consumers

**Failure:** The package relies on a MongoDB driver API, ESM behavior, or type export that differs across supported driver versions.

**Symptoms:**

- Consumers on a valid peer range fail typecheck.
- Runtime import works in Bun but fails in Node.
- `ObjectId` import location differs between environments.

**Prevention:**

- Keep the peer range narrow enough to match tested APIs.
- Test under the same Node/Bun targets supported by Bifrost.
- Prefer `mongodb` exports over direct `bson` unless compatibility requires otherwise.

**Recovery:**

- Narrow peer dependency range.
- Add compatibility shims only at import boundaries.
- Document the supported driver version in README and release notes.

## Acceptance Criteria

- `@example-app/bifrost/mongodb` and `@example-app/bifrost/mongodb/decorators` publish from `dist`.
- Non-MongoDB Bifrost consumers do not load the MongoDB driver.
- Collection decorators are metadata-only.
- `createBifrostMongo` returns native driver collections.
- No public `MongoRepository`, `MongoQuery`, `MongoDocument`, package-level `populate`, or package-level plugin system exists in version one.
- ObjectId helpers are compatible with the official driver.
- Schema helpers validate inserts, replacements, and explicit `$set` payloads.
- Timestamp and soft-delete helpers are explicit pure functions.
- Change streams emit Bifrost events and close cleanly.
- Driver sessions, transactions, aggregation, and bulk operations remain normal driver APIs.
- ExampleApp migration examples reduce Mongoose concepts to explicit native driver calls.
- Bifrost typecheck, focused tests, full tests, lint, and build pass before release.

## Non-Goals

- Recreating Mongoose schemas.
- Recreating Mongoose query chains.
- Recreating Mongoose hydrated documents.
- Recreating Mongoose populate.
- Supporting arbitrary Mongoose plugins.
- Hiding MongoDB sessions or transactions.
- Adding browser-side MongoDB support.
- Changing Bifrost wire protocol semantics.

## Verification Commands

Run in Bifrost:

```sh
cd bifrost-ts
bun run typecheck
bun run test:unit
bun run test:integration
bun run test:browser
bun run build
```

Run focused checks during implementation:

```sh
cd bifrost-ts
bun run test:unit -- src/mongodb
bun run test:integration -- src/mongodb
```

Run in ExampleApp after migration:

```sh
bun run typecheck
bun run test:unit
bun run test:integration
bun run server:build
rg "mongoose|HydratedDocument|Schema|Model|QueryWithHelpers" src --glob '!*.spec.ts'
```

The final `rg` command must return no production imports before removing `mongoose`.

## Self-Review

- Spec coverage: The revised plan covers package exports, decorator metadata, native collection registry, ObjectId/schema helpers, timestamp/filter helpers, find-one-or-create, change streams, ExampleApp migration, risk analysis, and verification.
- Scope correction: The plan explicitly removes repository/query/document/populate/plugin abstractions from version one and keeps the official driver as the application API.
- Risk coverage: The Praemeditatio Malorum section documents risks around accidental ORM rebuild, driver type weakening, decorator side effects, validation overreach, soft delete hidden behavior, relationship exposure, watcher lifecycle, replica-set testing, raw-write drift, ObjectId/EJSON compatibility, watch authorization, explicit-service duplication, session forwarding, driver version compatibility, side effects, migrations, auth/session drift, performance, protocol, and release surface.
- Placeholder scan: The document avoids incomplete placeholders and gives concrete files, APIs, commands, exclusions, migration examples, prevention paths, and recovery paths.
- Type consistency: Public names are aligned around `createBifrostMongo`, `MongoCollection`, `MongoSchema`, `MongoIndex`, `MongoWatch`, `objectId`, `toObjectId`, `withInsertTimestamps`, `withUpdateTimestamp`, `active`, and native `Collection<T>`.
- Delegation readiness: Each task includes owner, support role, risk tier, files, and verification commands.
