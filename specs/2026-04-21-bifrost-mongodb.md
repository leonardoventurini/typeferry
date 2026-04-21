# Bifrost MongoDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` by default to implement this plan task-by-task. If delegation is unavailable, continue in the current session with the same checklist, risk, and verification discipline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@example-app/bifrost/mongodb` as a decorator-driven MongoDB integration that can fully replace ExampleApp's current Mongoose dependency while preserving the application-level ergonomics ExampleApp relies on.

**Architecture:** The package provides a Bifrost-native MongoDB registry, schema contract, repository API, query API, document wrapper, hook/plugin system, reference population layer, and change-stream-to-Bifrost event bridge. The design intentionally targets the Mongoose subset ExampleApp actually uses and keeps the native MongoDB driver available as an escape hatch for migrations, bulk operations, and advanced aggregation.

**Tech Stack:** TypeScript, Bun, `mongodb`, `bson`, Zod, Bifrost server events/channels, TC39 Stage 3 decorators, Vitest, and the existing Bifrost package export/build pipeline.

**Delegation Strategy:** Start with one Cortex-first `explorer` sidecar only if the implementer has not already read the current Bifrost decorator and packaging files. The supervisor should own the public API and integration boundaries, assign independent worker tasks for schema/query/document/change-stream files with disjoint write scopes, then require verifier coverage for all public API and ExampleApp parity behavior because this is a high-risk public package surface.

---

## Problem

ExampleApp currently depends heavily on Mongoose for persistence, model declaration, validation-ish schema shape, statics, instance methods, plugins, hooks, `lean()` behavior, `populate()`, change streams, raw collection access, and ObjectId utilities. Replacing Mongoose with direct `mongodb` driver calls in application code would scatter persistence concerns across the codebase and would make Bifrost less helpful for real-time data applications.

The package should become the direct path from MongoDB writes to Bifrost server behavior:

- A collection declaration should look and feel close to Bifrost's method declaration system.
- Database writes should be type-aware and validation-aware.
- Change streams should register Bifrost events without separate watcher boilerplate.
- Mongoose-specific app code should migrate to a Bifrost-owned model/repository abstraction.
- Native MongoDB access should remain available where abstraction would add risk.

## Current Reference Surface

The reference application is `<user-home>/Repositories/example-app/example-app`.

Observed ExampleApp Mongoose footprint:

- `43` collection files under `src/server/data/collections`
- `50` schema files under `src/server/data/schemas`
- `200+` TypeScript files with direct Mongoose/model/query usage
- Direct uses of `mongoose.connect`, `mongoose.disconnect`, `mongoose.model`, `mongoose.models`, `mongoose.connection.db.collection`, `mongoose.Collection.watch`, `mongoose.Types.ObjectId`, `Schema`, `model`, `Model`, `HydratedDocument`, `Document`, `QueryWithHelpers`, `QueryFilter`, and `UpdateWriteOpResult`
- Common query/document methods: `find`, `findOne`, `findById`, `create`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, `countDocuments`, `distinct`, `aggregate`, `watch`, `.collection.*`, `.lean()`, `.lean(false)`, `.populate()`, `.select()`, `.sort()`, `.limit()`, `.skip()`, `.save()`
- Mongoose extensions and plugins: soft delete, default lean, find-one-or-create, orderable, compound orderable, add-count, add-computed-field, Meilisearch sync, schema indexes, schema hooks, schema statics, schema instance methods

The first implementation must not attempt to clone all of Mongoose. It must cover the above behavior explicitly and provide typed native-driver escape hatches for advanced cases.

## Proposed Public API

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

Add `mongodb` and `bson` as optional peer dependencies and dev dependencies:

```json
{
  "peerDependencies": {
    "mongodb": ">=6",
    "bson": ">=6"
  },
  "peerDependenciesMeta": {
    "mongodb": {
      "optional": true
    },
    "bson": {
      "optional": true
    }
  }
}
```

If `mongodb` re-exports `ObjectId` cleanly for the supported range, `bson` may be used only for explicit consumer compatibility.

### Decorator Syntax

The package should mirror the shape of `@Namespace`, `@Method`, and `registerNamespace`:

```ts
import { z } from 'zod'
import {
  MongoCollection,
  MongoIndex,
  MongoReference,
  MongoStatic,
  MongoBefore,
  MongoAfter,
  MongoWatch,
  registerMongoCollections,
  objectId,
  MongoRepository,
} from '@example-app/bifrost/mongodb'

const BoardSchema = z.object({
  _id: objectId(),
  name: z.string(),
  author: objectId(),
  nodeCount: z.number().int().nonnegative().default(0),
  deletedAt: z.date().optional(),
  deletedBy: objectId().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type Board = z.infer<typeof BoardSchema>

@MongoCollection<Board>({
  name: 'boards',
  schema: BoardSchema,
  timestamps: true,
})
@MongoIndex({ author: 1, deletedAt: 1 })
@MongoReference({
  path: 'author',
  collection: 'users',
  foreignField: '_id',
})
@MongoWatch({
  event: 'boards.changed',
  getChannel: doc => String(doc.author),
  excludeFields: ['analytics'],
})
class BoardStore extends MongoRepository<Board> {
  @MongoStatic()
  async updateDiskUsage(boardId: ObjectId, bytes: number) {
    return this.updateOne({ _id: boardId }, { $set: { diskUsage: bytes } })
  }

  @MongoBefore('insert')
  normalizeNewBoard(doc: Board): void {
    doc.nodeCount ??= 0
  }
}

const mongo = await registerMongoCollections({
  server,
  uri: process.env.DATABASE,
  authSource: 'admin',
  collections: [BoardStore],
})

export const BoardCollection = mongo.collection(BoardStore)
```

### Repository API

Every registered class extending `MongoRepository<TDocument>` should receive a typed API:

```ts
interface MongoRepository<TDocument extends MongoBaseDocument> {
  readonly name: string
  readonly native: Collection<TDocument>

  find(filter?: Filter<TDocument>, options?: FindOptions<TDocument>): MongoQuery<TDocument[]>
  findOne(filter: Filter<TDocument>, options?: FindOptions<TDocument>): MongoQuery<TDocument | null>
  findById(id: ObjectIdLike, options?: FindOptions<TDocument>): MongoQuery<TDocument | null>
  create(input: InsertInput<TDocument>): Promise<MongoDocument<TDocument>>
  insertMany(inputs: Array<InsertInput<TDocument>>): Promise<Array<MongoDocument<TDocument>>>
  updateOne(filter: Filter<TDocument>, update: UpdateFilter<TDocument>): Promise<UpdateResult<TDocument>>
  updateMany(filter: Filter<TDocument>, update: UpdateFilter<TDocument>): Promise<UpdateResult<TDocument>>
  findOneAndUpdate(
    filter: Filter<TDocument>,
    update: UpdateFilter<TDocument>,
    options?: FindOneAndUpdateOptions,
  ): MongoQuery<TDocument | null>
  deleteOne(filter: Filter<TDocument>): Promise<DeleteResult>
  deleteMany(filter: Filter<TDocument>): Promise<DeleteResult>
  countDocuments(filter?: Filter<TDocument>): Promise<number>
  distinct<TKey extends keyof TDocument>(field: TKey, filter?: Filter<TDocument>): Promise<Array<TDocument[TKey]>>
  aggregate<TResult = unknown>(pipeline: Document[]): AggregationCursor<TResult>
  watch(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream<TDocument>
}
```

Names may differ during implementation if MongoDB driver type constraints require it, but exported types must avoid `any`.

### Query API

`MongoQuery<TResult>` should support ExampleApp's common fluent query operations:

```ts
interface MongoQuery<TResult> extends PromiseLike<TResult> {
  select(projection: ProjectionSpec): MongoQuery<TResult>
  sort(sort: SortSpec): MongoQuery<TResult>
  limit(count: number): MongoQuery<TResult>
  skip(count: number): MongoQuery<TResult>
  populate(path: string, projection?: ProjectionSpec): MongoQuery<TResult>
  populate(spec: PopulateSpec | PopulateSpec[]): MongoQuery<TResult>
  lean(value?: true): MongoQuery<LeanResult<TResult>>
  lean(value: false): MongoQuery<HydratedResult<TResult>>
  exec(): Promise<TResult>
}
```

`lean(false)` should not recreate full Mongoose documents. It should return `MongoDocument<T>` wrappers with `.save()`, `.deleteOne()`, and `.toObject()` so ExampleApp can migrate call sites that currently mutate hydrated Mongoose documents.

### Document API

```ts
interface MongoDocument<TDocument extends MongoBaseDocument> {
  readonly _id: TDocument['_id']
  readonly isNew: boolean
  toObject(): TDocument
  save(): Promise<MongoDocument<TDocument>>
  deleteOne(): Promise<DeleteResult>
}
```

The implementation should proxy field reads/writes or expose mutable fields directly only if type safety can be preserved. If proxying adds too much complexity, prefer `doc.toObject()` plus `doc.set(partial)`:

```ts
interface MongoDocument<TDocument extends MongoBaseDocument> {
  set(patch: Partial<TDocument>): void
}
```

### Schema API

Use Zod as the first schema contract instead of building a Mongoose-like schema DSL.

Provide helpers for MongoDB-specific types:

```ts
const objectId = (): z.ZodType<ObjectId>
const objectIdString = (): z.ZodType<string>
const dateWithDefault = (factory?: () => Date): z.ZodDefault<z.ZodDate>
```

The schema layer must support:

- validation before insert
- validation before full document replacement
- optional validation for update operators where reliable
- default application on inserts
- timestamp application on insert and update
- strict mode that rejects unknown keys
- passthrough mode for migrations and raw collections

### Hook API

Use explicit operation names rather than Mongoose method strings:

```ts
type MongoHookOperation =
  | 'insert'
  | 'insertMany'
  | 'updateOne'
  | 'updateMany'
  | 'findOneAndUpdate'
  | 'deleteOne'
  | 'deleteMany'
  | 'save'
```

Decorators:

```ts
@MongoBefore('insert')
@MongoAfter('insert')
@MongoBefore('updateOne')
@MongoAfter('updateOne')
```

Hook contexts should be typed:

```ts
interface MongoHookContext<TDocument> {
  collection: MongoRepository<TDocument>
  operation: MongoHookOperation
  filter?: Filter<TDocument>
  update?: UpdateFilter<TDocument>
  documents?: TDocument[]
  result?: unknown
}
```

### Plugin API

Plugins should be plain functions operating on collection definitions:

```ts
type MongoPlugin<TDocument extends MongoBaseDocument> = (
  definition: MongoCollectionDefinition<TDocument>,
) => void
```

Built-in plugins needed for ExampleApp:

- `timestampsPlugin()`
- `softDeletePlugin({ deletedAt, deletedBy })`
- `defaultLeanPlugin({ virtuals: true })`
- `findOneOrCreatePlugin()`

The soft delete plugin must add default filters for `find`, `findOne`, and `countDocuments`, plus repository methods:

```ts
softDeleteById(id: ObjectIdLike, userId: ObjectIdLike): Promise<UpdateResult>
restoreById(id: ObjectIdLike): Promise<UpdateResult>
softDeleteMany(filter: Filter<TDocument>, userId: ObjectIdLike): Promise<UpdateResult>
restoreMany(filter: Filter<TDocument>): Promise<UpdateResult>
```

### Reference Population API

`populate()` should be implemented as explicit registered references, not implicit schema magic:

```ts
@MongoReference({
  path: 'author',
  collection: 'users',
  localField: 'author',
  foreignField: '_id',
})
```

Support:

- single ObjectId reference
- ObjectId array reference
- projection strings like `'name email'`
- object projections like `{ name: 1, email: 1 }`
- batched fetch by collection and key
- stable preservation of missing references as `null` for single refs and omitted/null entries for arrays according to the reference config

### Change Stream API

`@MongoWatch` should register Bifrost events and create resilient MongoDB change streams:

```ts
@MongoWatch({
  event: 'boardNodes.changed',
  eventOptions: { protected: true },
  getChannel: doc => String(doc.board),
  excludeFields: ['analytics'],
  fullDocument: 'updateLookup',
})
```

It must:

- call `server.addEvent(event, eventOptions)`
- emit through `server.channel(channel).emit(event, payload)`
- include `eventId`, `_id`, `doc`, and `deleted`
- skip updates that only touch `updatedAt`
- skip updates where all changed fields are excluded
- resume after transient change-stream failures
- expose close handles through the Mongo registry so `server.close()` integrations can shut down cleanly

## File Structure

Create these Bifrost files:

- `bifrost-ts/src/mongodb/index.ts` — public exports for runtime, types, helpers, plugins, and decorators that are safe for server-side consumers
- `bifrost-ts/src/mongodb/client.ts` — connection creation from URI, existing `MongoClient`, or existing `Db`
- `bifrost-ts/src/mongodb/registry.ts` — registered collection metadata, repository instances, model lookup, shutdown, index creation
- `bifrost-ts/src/mongodb/schema.ts` — Zod/Mongo helper types, ObjectId validators, validation helpers, defaults, timestamps
- `bifrost-ts/src/mongodb/collection.ts` — `MongoRepository` base class and repository operation implementations
- `bifrost-ts/src/mongodb/query.ts` — fluent query builder, projections, sort, lean, populate, exec
- `bifrost-ts/src/mongodb/document.ts` — hydrated document wrapper and save/delete behavior
- `bifrost-ts/src/mongodb/hooks.ts` — hook registration and deterministic execution
- `bifrost-ts/src/mongodb/plugins.ts` — built-in plugin definitions
- `bifrost-ts/src/mongodb/populate.ts` — reference metadata and batched population implementation
- `bifrost-ts/src/mongodb/change-streams.ts` — resilient change stream wrapper and Bifrost event bridge
- `bifrost-ts/src/mongodb/decorators/index.ts` — decorator exports
- `bifrost-ts/src/mongodb/decorators/metadata.ts` — WeakMap metadata stores modeled after server decorator metadata
- `bifrost-ts/src/mongodb/decorators/collection.ts` — `@MongoCollection`, `@MongoIndex`, `@MongoReference`, `@MongoPlugin`
- `bifrost-ts/src/mongodb/decorators/hook.ts` — `@MongoBefore`, `@MongoAfter`
- `bifrost-ts/src/mongodb/decorators/static.ts` — `@MongoStatic`
- `bifrost-ts/src/mongodb/decorators/watch.ts` — `@MongoWatch`
- `bifrost-ts/src/mongodb/decorators/register.ts` — class registration bridge that creates repositories and binds statics/hooks

Create these tests:

- `bifrost-ts/src/mongodb/schema.unit.spec.ts`
- `bifrost-ts/src/mongodb/decorators.unit.spec.ts`
- `bifrost-ts/src/mongodb/query.unit.spec.ts`
- `bifrost-ts/src/mongodb/document.unit.spec.ts`
- `bifrost-ts/src/mongodb/plugins.unit.spec.ts`
- `bifrost-ts/src/mongodb/populate.integration.spec.ts`
- `bifrost-ts/src/mongodb/change-streams.integration.spec.ts`
- `bifrost-ts/src/mongodb/example-app-parity.integration.spec.ts`

Modify these existing files:

- `bifrost-ts/package.json` — add exports, optional peers, dev dependencies, and targeted test commands if useful
- `bifrost-ts/tsconfig.json` — keep path alias behavior compatible; no source alias should be required by package consumers
- `bifrost-ts/tsconfig.build.json` — no special include needed if files live under `src`
- `bifrost-ts/scripts/prepare-dist.mjs` — verify subpath dist imports still get `.js` suffixes; modify only if build output shows unresolved specifiers
- `bifrost-ts/src/ejson/mongoose.unit.spec.ts` — keep current BSON/ObjectId behavior covered or rename if Mongoose is no longer the right concept

Create this decision after implementation:

- `decisions/YYYY-MM-DD-bifrost-mongodb-decorator-registry.md`

## Implementation Tasks

### Task 1: Confirm Architecture And Blast Radius

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
- Verification: Cortex `graph_context` for Bifrost decorators and ExampleApp Mongoose usage, followed by targeted file reads

- [ ] **Step 1: Dispatch initial Cortex-first exploration sidecar**

  Ask for exact files, symbols, package export patterns, decorator metadata patterns, ExampleApp Mongoose usage categories, and implementation risks. Stop the sidecar if the graph is stale or if it recommends broad manual exploration.

- [ ] **Step 2: Verify the decorator pattern**

  Confirm the implementation can reuse the current WeakMap plus pending-update pattern from:

  ```txt
  bifrost-ts/src/server/decorators/metadata.ts
  bifrost-ts/src/server/decorators/namespace.ts
  bifrost-ts/src/server/decorators/register.ts
  ```

- [ ] **Step 3: Verify package export behavior**

  Run:

  ```sh
  cd bifrost-ts
  bun run build
  ```

  Expected: existing build passes before MongoDB work starts. If it fails before edits, record the failure and avoid mixing unrelated fixes into the MongoDB package commit.

### Task 2: Add MongoDB Package Skeleton

**Files:**
- Create: `bifrost-ts/src/mongodb/index.ts`
- Create: `bifrost-ts/src/mongodb/decorators/index.ts`
- Modify: `bifrost-ts/package.json`
- Test: `bifrost-ts/src/mongodb/index.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: `bun run typecheck`, `bun run build`, targeted unit test

- [ ] **Step 1: Add failing export smoke test**

  Create `bifrost-ts/src/mongodb/index.unit.spec.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'

  import {
    MongoRepository,
    createMongoBifrost,
    objectId,
  } from './index'
  import { MongoCollection } from './decorators'

  describe('@example-app/bifrost/mongodb exports', () => {
    it('exports the registry, repository base, schema helpers, and decorators', () => {
      expect(createMongoBifrost).toBeTypeOf('function')
      expect(MongoRepository).toBeTypeOf('function')
      expect(objectId).toBeTypeOf('function')
      expect(MongoCollection).toBeTypeOf('function')
    })
  })
  ```

- [ ] **Step 2: Add minimal public files**

  Create `bifrost-ts/src/mongodb/index.ts`:

  ```ts
  export { createMongoBifrost } from './registry'
  export { MongoRepository } from './collection'
  export { objectId } from './schema'
  export * from './decorators'
  ```

  Create `bifrost-ts/src/mongodb/decorators/index.ts`:

  ```ts
  export { MongoCollection } from './collection'
  ```

- [ ] **Step 3: Add placeholder-free minimal implementations**

  Create the smallest real implementations needed for the smoke test:

  ```ts
  export class MongoRepository<TDocument extends object = object> {
    protected readonly documentType?: TDocument
  }
  ```

  ```ts
  export function createMongoBifrost(): never {
    throw new Error('createMongoBifrost requires a MongoDB connection configuration.')
  }
  ```

  ```ts
  import { z } from 'zod'

  export function objectId(): z.ZodType<unknown> {
    return z.unknown()
  }
  ```

  ```ts
  export function MongoCollection(): ClassDecorator {
    return target => target
  }
  ```

- [ ] **Step 4: Add package exports**

  Update `bifrost-ts/package.json` exports with `./mongodb` and `./mongodb/decorators`.

- [ ] **Step 5: Verify skeleton**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/index.unit.spec.ts
  bun run typecheck
  bun run build
  ```

  Expected: the targeted test, typecheck, and build pass.

- [ ] **Step 6: Commit**

  Commit:

  ```sh
  git add bifrost-ts/package.json bifrost-ts/src/mongodb
  git commit -m "feat: add mongodb package surface"
  ```

### Task 3: Implement Decorator Metadata And Registration

**Files:**
- Create: `bifrost-ts/src/mongodb/decorators/metadata.ts`
- Create: `bifrost-ts/src/mongodb/decorators/collection.ts`
- Create: `bifrost-ts/src/mongodb/decorators/hook.ts`
- Create: `bifrost-ts/src/mongodb/decorators/static.ts`
- Create: `bifrost-ts/src/mongodb/decorators/watch.ts`
- Create: `bifrost-ts/src/mongodb/decorators/register.ts`
- Modify: `bifrost-ts/src/mongodb/decorators/index.ts`
- Test: `bifrost-ts/src/mongodb/decorators.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: decorator unit tests and `bun run typecheck`

- [ ] **Step 1: Write decorator tests**

  Cover:

  - `@MongoCollection` stores name, schema, timestamps, strict mode
  - `@MongoIndex` appends index definitions
  - `@MongoReference` appends reference definitions
  - `@MongoBefore` and `@MongoAfter` queue method metadata and flush through `@MongoCollection`
  - `@MongoStatic` records static method names
  - `@MongoWatch` appends watcher definitions
  - metadata isolation between classes in the same file

- [ ] **Step 2: Implement metadata stores**

  Use the same style as Bifrost server decorators:

  ```ts
  export interface MongoCollectionMeta<TDocument extends object = object> {
    name: string
    schema?: z.ZodType<TDocument>
    timestamps: boolean
    strict: boolean
    indexes: MongoIndexMeta[]
    references: MongoReferenceMeta[]
    hooks: Map<string, MongoHookMeta[]>
    statics: Set<string>
    watches: MongoWatchMeta<TDocument>[]
  }
  ```

  Use WeakMaps keyed by class constructor. Use pending update queues for method decorators to avoid Bun decorator initializer leakage.

- [ ] **Step 3: Implement class and member decorators**

  `@MongoCollection` must flush pending updates after setting class metadata.

  Member decorators must queue updates until the class decorator runs.

- [ ] **Step 4: Implement `getMongoCollectionMeta`**

  Export a testable metadata read function from `decorators/register.ts` or `decorators/metadata.ts`.

- [ ] **Step 5: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/decorators.unit.spec.ts
  bun run typecheck
  ```

  Expected: tests pass without decorator metadata leaking across test classes.

- [ ] **Step 6: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/decorators bifrost-ts/src/mongodb/decorators.unit.spec.ts
  git commit -m "feat: add mongodb collection decorators"
  ```

### Task 4: Implement Connection Registry

**Files:**
- Create: `bifrost-ts/src/mongodb/client.ts`
- Create: `bifrost-ts/src/mongodb/registry.ts`
- Modify: `bifrost-ts/src/mongodb/index.ts`
- Test: `bifrost-ts/src/mongodb/registry.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: unit tests with mocked `MongoClient`, typecheck, build

- [ ] **Step 1: Write registry tests**

  Test:

  - accepts an existing `Db`
  - accepts an existing `MongoClient`
  - accepts a URI and creates a client
  - registers class metadata into repository instances
  - rejects classes missing `@MongoCollection`
  - creates indexes during registration
  - closes owned clients and change streams
  - does not close externally owned clients unless configured

- [ ] **Step 2: Implement connection input types**

  ```ts
  export interface MongoBifrostOptions {
    server?: Server
    uri?: string
    client?: MongoClient
    db?: Db
    dbName?: string
    authSource?: string
    collections?: Array<MongoCollectionClass>
    closeExternalClient?: boolean
  }
  ```

- [ ] **Step 3: Implement registry**

  The registry should expose:

  ```ts
  collection<TRepository extends MongoRepository>(
    Class: MongoRepositoryClass<TRepository>,
  ): TRepository

  collectionByName<TDocument extends object>(name: string): MongoRepository<TDocument>

  close(): Promise<void>
  ```

- [ ] **Step 4: Wire public export**

  `createMongoBifrost(options)` should return `Promise<MongoBifrostRegistry>`.

- [ ] **Step 5: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/registry.unit.spec.ts
  bun run typecheck
  bun run build
  ```

- [ ] **Step 6: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/client.ts bifrost-ts/src/mongodb/registry.ts bifrost-ts/src/mongodb/index.ts bifrost-ts/src/mongodb/registry.unit.spec.ts
  git commit -m "feat: register mongodb repositories"
  ```

### Task 5: Implement Schema And ObjectId Contracts

**Files:**
- Create: `bifrost-ts/src/mongodb/schema.ts`
- Test: `bifrost-ts/src/mongodb/schema.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: schema unit tests and typecheck

- [ ] **Step 1: Write schema tests**

  Cover:

  - `objectId()` accepts `ObjectId`
  - `objectId()` rejects invalid strings in strict mode
  - `coerceObjectId()` converts valid ObjectId strings
  - insert validation applies defaults
  - timestamps apply `createdAt` and `updatedAt`
  - update validation applies `updatedAt`
  - strict schemas reject unknown keys

- [ ] **Step 2: Implement helpers**

  ```ts
  export function objectId(): z.ZodType<ObjectId>
  export function coerceObjectId(): z.ZodType<ObjectId>
  export function isObjectIdLike(value: unknown): value is ObjectId | string
  export function normalizeObjectId(value: ObjectId | string): ObjectId
  ```

- [ ] **Step 3: Implement validation helpers**

  ```ts
  validateInsert<T>(schema: z.ZodType<T>, input: unknown): T
  validateReplacement<T>(schema: z.ZodType<T>, input: unknown): T
  applyTimestamps<T>(input: T, mode: 'insert' | 'update'): T
  ```

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/schema.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/schema.ts bifrost-ts/src/mongodb/schema.unit.spec.ts
  git commit -m "feat: validate mongodb document schemas"
  ```

### Task 6: Implement Repository Operations

**Files:**
- Create: `bifrost-ts/src/mongodb/collection.ts`
- Modify: `bifrost-ts/src/mongodb/registry.ts`
- Test: `bifrost-ts/src/mongodb/collection.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: repository unit tests and integration parity tests later

- [ ] **Step 1: Write repository operation tests**

  Mock native collection methods and verify:

  - `find` creates a `MongoQuery`
  - `findOne` creates a `MongoQuery`
  - `findById` normalizes string ObjectIds
  - `create` validates, applies defaults, inserts, then returns a document wrapper
  - `insertMany` validates each document
  - `updateOne` applies update timestamps
  - `updateMany` applies update timestamps
  - `findOneAndUpdate` supports returning updated documents
  - `native` exposes the underlying collection

- [ ] **Step 2: Implement `MongoRepository`**

  `MongoRepository` should be a real base class with protected binding from the registry:

  ```ts
  protected bindMongoContext(context: MongoRepositoryContext<TDocument>): void
  ```

  Keep the binding method non-public to prevent consumers from constructing half-bound repositories.

- [ ] **Step 3: Add typed operation methods**

  Implement all core repository methods against `mongodb.Collection<TDocument>`.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/collection.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/collection.ts bifrost-ts/src/mongodb/collection.unit.spec.ts bifrost-ts/src/mongodb/registry.ts
  git commit -m "feat: add typed mongodb repositories"
  ```

### Task 7: Implement Query Builder

**Files:**
- Create: `bifrost-ts/src/mongodb/query.ts`
- Modify: `bifrost-ts/src/mongodb/collection.ts`
- Test: `bifrost-ts/src/mongodb/query.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: query unit tests and typecheck

- [ ] **Step 1: Write query tests**

  Cover:

  - `.select('name email')` maps to projection
  - `.select({ name: 1 })` maps to projection
  - `.sort({ createdAt: -1 })`
  - `.limit(10)`
  - `.skip(20)`
  - `.lean()` returns plain objects
  - `.lean(false)` returns document wrappers
  - awaiting the query calls `.exec()`
  - `.exec()` is idempotent and does not issue duplicate database reads

- [ ] **Step 2: Implement `MongoQuery`**

  Use `PromiseLike<TResult>` and an internal memoized execution promise.

- [ ] **Step 3: Integrate repository reads**

  `find`, `findOne`, `findById`, and `findOneAndUpdate` should return `MongoQuery`.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/query.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/query.ts bifrost-ts/src/mongodb/query.unit.spec.ts bifrost-ts/src/mongodb/collection.ts
  git commit -m "feat: add mongodb query builder"
  ```

### Task 8: Implement Document Wrapper

**Files:**
- Create: `bifrost-ts/src/mongodb/document.ts`
- Modify: `bifrost-ts/src/mongodb/query.ts`
- Modify: `bifrost-ts/src/mongodb/collection.ts`
- Test: `bifrost-ts/src/mongodb/document.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: document tests and ExampleApp hydrated-document parity tests later

- [ ] **Step 1: Write document tests**

  Cover:

  - `toObject()` returns the current object state
  - `set()` mutates pending document state
  - `save()` validates and writes `$set` changes
  - `save()` applies `updatedAt`
  - `deleteOne()` deletes by `_id`
  - `lean(false)` read results are wrapped documents

- [ ] **Step 2: Implement `MongoDocument`**

  Prefer explicit `.set()` over proxy mutation for version one.

- [ ] **Step 3: Wire into `create` and query hydration**

  `create()` should return a document wrapper. `lean(false)` should hydrate reads.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/document.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/document.ts bifrost-ts/src/mongodb/document.unit.spec.ts bifrost-ts/src/mongodb/query.ts bifrost-ts/src/mongodb/collection.ts
  git commit -m "feat: hydrate mongodb documents"
  ```

### Task 9: Implement Hooks And Statics

**Files:**
- Create: `bifrost-ts/src/mongodb/hooks.ts`
- Modify: `bifrost-ts/src/mongodb/collection.ts`
- Modify: `bifrost-ts/src/mongodb/registry.ts`
- Test: `bifrost-ts/src/mongodb/hooks.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: hook ordering tests and typecheck

- [ ] **Step 1: Write hook and static tests**

  Cover:

  - before hooks run before native operations
  - after hooks receive operation results
  - hooks can mutate insert documents
  - hooks can mutate update operators
  - hook errors prevent writes
  - `@MongoStatic` methods are callable on the repository instance
  - static methods receive `this` as the bound repository

- [ ] **Step 2: Implement hook runner**

  Add deterministic operation context and explicit before/after phases.

- [ ] **Step 3: Bind statics during registration**

  Copy decorated methods from the repository class prototype onto the repository instance with correct `this` binding.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/hooks.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/hooks.ts bifrost-ts/src/mongodb/hooks.unit.spec.ts bifrost-ts/src/mongodb/collection.ts bifrost-ts/src/mongodb/registry.ts
  git commit -m "feat: run mongodb hooks and statics"
  ```

### Task 10: Implement Built-In Plugins

**Files:**
- Create: `bifrost-ts/src/mongodb/plugins.ts`
- Modify: `bifrost-ts/src/mongodb/collection.ts`
- Modify: `bifrost-ts/src/mongodb/query.ts`
- Test: `bifrost-ts/src/mongodb/plugins.unit.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: plugin tests and ExampleApp plugin parity tests later

- [ ] **Step 1: Write plugin tests**

  Cover:

  - timestamps plugin adds dates on insert
  - timestamps plugin updates `updatedAt`
  - soft delete adds default read filters
  - soft delete can be bypassed through an explicit `{ deleted: true }` option
  - `softDeleteById`, `restoreById`, `softDeleteMany`, `restoreMany`
  - find-one-or-create returns existing document without creating a duplicate
  - find-one-or-create creates when missing

- [ ] **Step 2: Implement plugin contract**

  Plugins should modify collection definitions before repositories are instantiated.

- [ ] **Step 3: Implement built-ins**

  Export:

  ```ts
  timestampsPlugin()
  softDeletePlugin()
  defaultLeanPlugin()
  findOneOrCreatePlugin()
  ```

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:unit -- src/mongodb/plugins.unit.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/plugins.ts bifrost-ts/src/mongodb/plugins.unit.spec.ts bifrost-ts/src/mongodb/collection.ts bifrost-ts/src/mongodb/query.ts
  git commit -m "feat: add mongodb repository plugins"
  ```

### Task 11: Implement Reference Population

**Files:**
- Create: `bifrost-ts/src/mongodb/populate.ts`
- Modify: `bifrost-ts/src/mongodb/query.ts`
- Modify: `bifrost-ts/src/mongodb/registry.ts`
- Test: `bifrost-ts/src/mongodb/populate.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: integration tests with real MongoDB test database or isolated MongoDB test harness

- [ ] **Step 1: Write populate integration tests**

  Cover:

  - single reference population
  - array reference population
  - missing single ref returns `null`
  - projection string selects only requested fields
  - projection object selects only requested fields
  - population batches IDs into one query per target collection

- [ ] **Step 2: Implement population planner**

  Group requested population specs by target collection and foreign field.

- [ ] **Step 3: Implement result merger**

  Merge populated documents into result objects without mutating cached query results across independent queries.

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:integration -- src/mongodb/populate.integration.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/populate.ts bifrost-ts/src/mongodb/populate.integration.spec.ts bifrost-ts/src/mongodb/query.ts bifrost-ts/src/mongodb/registry.ts
  git commit -m "feat: populate mongodb references"
  ```

### Task 12: Implement Bifrost Change Stream Bridge

**Files:**
- Create: `bifrost-ts/src/mongodb/change-streams.ts`
- Modify: `bifrost-ts/src/mongodb/registry.ts`
- Modify: `bifrost-ts/src/mongodb/collection.ts`
- Test: `bifrost-ts/src/mongodb/change-streams.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: integration tests and reviewer pass because this touches Bifrost server event semantics

- [ ] **Step 1: Write change stream tests**

  Cover:

  - watcher registers Bifrost event through `server.addEvent`
  - insert emits event with `doc`
  - update emits event with updated `doc`
  - delete emits event with `deleted: true`
  - update containing only `updatedAt` is skipped
  - update containing only excluded fields is skipped
  - `getChannel` can return one channel or multiple channels
  - registry close closes open change streams

- [ ] **Step 2: Implement resilient wrapper**

  Port the behavior from ExampleApp's current `createResilientChangeStream` into a package-owned implementation with typed inputs and no Mongoose dependency.

- [ ] **Step 3: Implement Bifrost bridge**

  Emit through:

  ```ts
  server.channel(channel).emit(event, payload)
  ```

  Payload:

  ```ts
  {
    eventId: string,
    _id: ObjectId,
    doc: TDocument | null,
    deleted: boolean,
  }
  ```

- [ ] **Step 4: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:integration -- src/mongodb/change-streams.integration.spec.ts
  bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/change-streams.ts bifrost-ts/src/mongodb/change-streams.integration.spec.ts bifrost-ts/src/mongodb/registry.ts bifrost-ts/src/mongodb/collection.ts
  git commit -m "feat: bridge mongodb changes to bifrost events"
  ```

### Task 13: Add ExampleApp Parity Tests

**Files:**
- Create: `bifrost-ts/src/mongodb/example-app-parity.integration.spec.ts`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: integration tests and reviewer pass

- [ ] **Step 1: Create representative schemas**

  Include `User`, `Board`, `BoardNode`, and `Session` style documents with ObjectId references, timestamps, soft delete, statics, and hooks.

- [ ] **Step 2: Test current ExampleApp patterns**

  Cover:

  - `BoardCollection.find({ author }).lean()`
  - `BoardCollection.findById(id).lean(false)` followed by `set()` and `save()`
  - `BoardCollection.updateOne({ _id }, { $set })`
  - `BoardCollection.softDeleteById(id, userId)`
  - `RoleCollection.find({ org }).populate('user', 'name email')`
  - `SessionCollection.findOneOrCreate({ familyId })`
  - `BoardNodeCollection.aggregate([...])`
  - `BoardNodeCollection.native.updateMany(...)`

- [ ] **Step 3: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run test:integration -- src/mongodb/example-app-parity.integration.spec.ts
  bun run typecheck
  bun run build
  ```

- [ ] **Step 4: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/example-app-parity.integration.spec.ts
  git commit -m "test: cover example-app mongodb parity"
  ```

### Task 14: Update Documentation And Decision Record

**Files:**
- Create: `bifrost-ts/src/mongodb/README.md` if package-local docs are accepted by the repo
- Create: `decisions/YYYY-MM-DD-bifrost-mongodb-decorator-registry.md`
- Modify: `RELEASING.md` if package export behavior or peer dependency release steps change

**Execution:**
- Owner: `supervisor`
- Support: `reviewer`
- Risk: `medium`
- Verification: doc review, package build, no broken links

- [ ] **Step 1: Write usage documentation**

  Include:

  - connection setup
  - collection decorator example
  - schema helper example
  - repository operations
  - statics and hooks
  - populate
  - change streams
  - migration notes from Mongoose
  - raw driver escape hatch

- [ ] **Step 2: Write decision record**

  Record:

  - why the package uses Zod schemas instead of cloning Mongoose schemas
  - why decorators register metadata instead of relying on runtime type metadata
  - why native driver access remains public
  - why `lean(false)` returns Bifrost document wrappers instead of Mongoose-compatible documents

- [ ] **Step 3: Verify**

  Run:

  ```sh
  cd bifrost-ts
  bun run build
  ```

- [ ] **Step 4: Commit**

  ```sh
  git add bifrost-ts/src/mongodb/README.md decisions/YYYY-MM-DD-bifrost-mongodb-decorator-registry.md RELEASING.md
  git commit -m "docs: explain mongodb repository design"
  ```

### Task 15: Full Verification And Risk Review

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

- [ ] **Step 2: Run full package checks**

  ```sh
  cd bifrost-ts
  bun run test
  bun run lint
  ```

- [ ] **Step 3: Run Cortex risk report**

  Use `regression_risk_report` on all changed files under `bifrost-ts/src/mongodb`, `bifrost-ts/package.json`, and any build/doc files.

- [ ] **Step 4: Review public API declarations**

  Inspect generated declarations:

  ```sh
  cd bifrost-ts
  find dist/mongodb -name '*.d.ts' -maxdepth 3 -print
  ```

  Confirm consumers can import from `@example-app/bifrost/mongodb` and `@example-app/bifrost/mongodb/decorators` without source aliases.

- [ ] **Step 5: Final commit if verification required fixes**

  ```sh
  git add bifrost-ts/src/mongodb bifrost-ts/package.json bifrost-ts/scripts bifrost-ts/tsconfig*.json RELEASING.md decisions
  git commit -m "fix: harden mongodb package release surface"
  ```

## ExampleApp Migration Plan

The Bifrost package must be implemented first. Then migrate ExampleApp in one direct rollout with frequent logical commits.

### ExampleApp Task 1: Replace Connection Layer

**Files:**
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/db-connect.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/index.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/test/global-setup.ts`

**Execution:**
- Owner: `supervisor`
- Support: `verifier`
- Risk: `high`
- Verification: ExampleApp `bun run typecheck`, test global setup smoke

- [ ] Replace `mongoose.connect` with `createMongoBifrost`.
- [ ] Replace `mongoose.disconnect` with registry close.
- [ ] Preserve current `authSource: 'admin'`.
- [ ] Preserve CI direct connection behavior.
- [ ] Keep `bson.ObjectId` as the canonical app ObjectId type.

### ExampleApp Task 2: Convert Simple Collections

**Files:**
- Modify files under `<user-home>/Repositories/example-app/example-app/src/server/data/collections`
- Modify matching files under `<user-home>/Repositories/example-app/example-app/src/server/data/schemas`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `medium`
- Verification: ExampleApp unit and integration tests touching OAuth, settings, notifications, store

- [ ] Convert OAuth client/code/token collections.
- [ ] Convert settings.
- [ ] Convert notifications.
- [ ] Convert store collections.
- [ ] Keep raw native access where migrations currently use raw collection methods.

### ExampleApp Task 3: Port Shared Plugins

**Files:**
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/plugins/soft-delete.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/plugins/lean-plugin.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/extenders/add-count.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/extenders/add-computed-field.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/plugins/orderable.ts`
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/plugins/mongoose-meilisearch.ts`

**Execution:**
- Owner: `worker`
- Support: `reviewer`
- Risk: `high`
- Verification: existing plugin integration tests plus new Bifrost MongoDB parity tests

- [ ] Replace Mongoose hook usage with Bifrost MongoDB hooks.
- [ ] Replace schema mutation with collection-definition plugins.
- [ ] Replace model registry lookup with registry `collectionByName`.
- [ ] Replace Mongoose documents with `MongoDocument` wrappers where mutation and save are needed.

### ExampleApp Task 4: Convert Complex Collections

**Files:**
- Modify User, Board, BoardNode, Deck, Exercise, Session, File, Role, Organization, Friendship, DirectMessage, DirectConversation collections and schemas

**Execution:**
- Owner: `worker`
- Support: `verifier` and `reviewer`
- Risk: `high`
- Verification: ExampleApp full server integration tests

- [ ] Convert User statics and hooks.
- [ ] Convert Board statics, soft delete, count behavior, and references.
- [ ] Convert BoardNode nested schema shape, hooks, and references.
- [ ] Convert Deck and Exercise delete/update cascade hooks.
- [ ] Convert Session auth and revocation queries.
- [ ] Convert File storage statics.
- [ ] Convert organization and role population paths.

### ExampleApp Task 5: Replace Populate And Change Streams

**Files:**
- Modify: `<user-home>/Repositories/example-app/example-app/src/server/data/change-streams.ts`
- Modify files under `<user-home>/Repositories/example-app/example-app/src/server/methods`
- Modify files under `<user-home>/Repositories/example-app/example-app/src/server/jobs`

**Execution:**
- Owner: `worker`
- Support: `verifier`
- Risk: `high`
- Verification: events, boards, friends, organizations, jobs integration tests

- [ ] Replace `.populate()` calls with registered references.
- [ ] Replace current watcher setup with `@MongoWatch`.
- [ ] Preserve event payload shape currently consumed by Bifrost clients.
- [ ] Preserve excluded-field behavior for analytics and background updates.

### ExampleApp Task 6: Remove Mongoose

**Files:**
- Modify: `<user-home>/Repositories/example-app/example-app/package.json`
- Modify: `<user-home>/Repositories/example-app/example-app/bun.lock`
- Modify any remaining imports found by `rg`

**Execution:**
- Owner: `supervisor`
- Support: `verifier` and `reviewer`
- Risk: `high`
- Verification: full ExampleApp verification suite

- [ ] Run `rg "mongoose|HydratedDocument|Schema|Model|QueryWithHelpers" src`.
- [ ] Replace remaining ObjectId imports with `bson` or `mongodb`.
- [ ] Remove `mongoose` dependency through Bun.
- [ ] Run full checks:

  ```sh
  bun run typecheck
  bun run test:unit
  bun run test:integration
  bun run server:build
  ```

## Acceptance Criteria

- Bifrost publishes `@example-app/bifrost/mongodb` and `@example-app/bifrost/mongodb/decorators` from `dist`.
- Consumers do not need `node_modules/@example-app/bifrost/src` aliases.
- MongoDB dependency remains optional for non-server Bifrost consumers.
- Decorators work with the same Stage 3 decorator assumptions as Bifrost method decorators.
- Registered repositories expose typed core MongoDB operations.
- Zod-backed schemas validate inserts and replacements.
- ObjectId helpers interoperate with MongoDB/BSON ObjectIds and string inputs where configured.
- Query builder supports ExampleApp's common `lean`, projection, sort, limit, skip, and populate patterns.
- `lean(false)` supports mutation plus `save()` through `MongoDocument`.
- Hooks, statics, and plugins cover ExampleApp's existing Mongoose extension patterns.
- Change streams emit Bifrost events with current ExampleApp-compatible payloads.
- Native driver access remains available through `repository.native`.
- Bifrost unit, integration, browser tests, typecheck, lint, and build pass.
- ExampleApp can remove `mongoose` after its migration tasks complete.

## Non-Goals

- Recreating the full Mongoose schema DSL.
- Supporting arbitrary Mongoose plugins unchanged.
- Providing a browser-side MongoDB client.
- Hiding the native MongoDB driver from advanced server code.
- Changing Bifrost wire protocol semantics.
- Adding protocol changes to `PROTOCOL.md`; this package operates above the wire protocol.

## Open Design Constraints

- The package should prefer explicit Zod schemas over runtime decorator type inference.
- The implementation should avoid `any` in public exported types; use `unknown`, generic constraints, and type guards.
- The implementation should keep long-running change streams non-blocking and closeable.
- The implementation should not introduce Mongoose as a dependency, even for compatibility tests.
- The implementation should not make Redis required; clustered event propagation should reuse existing Bifrost event options.

## Praemeditatio Malorum: Failure Modes And Risk Register

This section assumes the implementation will fail in predictable ways unless each risk is designed against up front. Each risk includes the likely symptom, prevention strategy, and recovery path.

### 1. Accidentally Rebuilding Mongoose

**Failure:** The package grows a large compatibility surface that tries to support arbitrary Mongoose schemas, plugins, middleware names, document mutation semantics, query helpers, and casting behavior.

**Symptoms:**

- Implementation files become large and cross-coupled.
- Public API starts accepting Mongoose concepts by name.
- Tests assert Mongoose quirks instead of ExampleApp needs.
- Consumers cannot understand where Bifrost ends and Mongoose compatibility begins.

**Prevention:**

- Treat ExampleApp's current usage as the compatibility contract, not Mongoose as a whole.
- Keep the native driver escape hatch public and documented.
- Prefer explicit Bifrost MongoDB concepts: repository, schema, hook, plugin, reference, watch.
- Reject feature requests that require simulating undocumented Mongoose behavior unless ExampleApp depends on them and no native-driver path is adequate.

**Recovery:**

- Move compatibility-only helpers into `mongodb/compat` before release.
- Mark any accidental Mongoose-shaped APIs as internal before publishing.
- Replace broad abstractions with direct native driver access at call sites that need rare behavior.

### 2. Decorator Metadata Leaks Across Classes

**Failure:** Stage 3 decorator metadata is stored incorrectly, causing hooks, statics, indexes, references, or watchers from one class to attach to another class.

**Symptoms:**

- Tests pass in isolation but fail when run as a file.
- A collection receives indexes or watchers declared on a different collection.
- Registration order changes behavior.

**Prevention:**

- Reuse Bifrost server decorator's WeakMap plus pending-update queue pattern.
- Add same-file, multi-class isolation tests for every decorator category.
- Flush pending member metadata only from the class decorator.
- Clear test metadata between tests through exported test-only helpers if needed.

**Recovery:**

- Stop implementation work and isolate decorator metadata with unit tests before continuing.
- Refactor all decorator state into one metadata module.
- Add regression tests matching the failing class order.

### 3. Type Surface Leaks `any`

**Failure:** Public repository, query, document, hook, plugin, and schema types use `any`, eroding the main value of replacing Mongoose.

**Symptoms:**

- Consumer hover docs lose document types after `.find()`, `.lean()`, `.populate()`, or custom statics.
- TypeScript cannot catch invalid document field names.
- ExampleApp migrations require casts at every call site.

**Prevention:**

- Use `unknown`, `Filter<TDocument>`, `UpdateFilter<TDocument>`, `OptionalUnlessRequiredId<TDocument>`, and explicit generic constraints.
- Add type-only tests with representative ExampleApp document types.
- Keep exported function return types explicit.
- Do not use non-null assertions or inline `import()` type annotations.

**Recovery:**

- Add a `types.unit.spec.ts` or `tsd`-style compile fixture before broad implementation continues.
- Patch the generic contract first, then repair implementation errors.

### 4. Zod Schema And MongoDB Driver Types Diverge

**Failure:** Runtime schemas, insert input types, MongoDB driver types, and returned documents disagree about optional fields, defaults, ObjectId fields, timestamps, or strictness.

**Symptoms:**

- Valid MongoDB documents fail Zod parsing after reads.
- Inserts require fields that should be defaulted.
- Timestamps are missing or overwritten incorrectly.
- Update operators accept values that full documents reject.

**Prevention:**

- Define separate types for insert input, stored document, update input, and read output.
- Apply defaults only on insert and full replacement.
- Apply `updatedAt` through update operator rewriting, not by mutating arbitrary update payloads blindly.
- Keep update validation conservative; validate known `$set` payloads and document exact limitations.

**Recovery:**

- Add failing tests for the specific insert/update/read mismatch.
- Split schema helpers instead of making one helper handle all modes.

### 5. ObjectId Compatibility Breaks Existing Data

**Failure:** The package normalizes ObjectIds inconsistently across `bson`, `mongodb`, string inputs, EJSON serialization, and existing ExampleApp document constants.

**Symptoms:**

- Queries by string id stop matching existing documents.
- Bifrost event channel names receive `[object Object]`.
- `EJSON` serializes ObjectIds differently from current behavior.
- Tests pass with strings but fail with real `ObjectId` instances.

**Prevention:**

- Use one canonical `ObjectId` implementation from the MongoDB driver or `bson`.
- Centralize `isObjectIdLike`, `normalizeObjectId`, and channel string conversion.
- Test string input, `ObjectId` input, invalid string input, and round-trip serialization.
- Keep channel names as explicit `String(id)`.

**Recovery:**

- Add compatibility tests copied from ExampleApp ObjectId call sites.
- Introduce explicit `objectIdString()` for fields that must remain strings.

### 6. Query Builder Executes More Than Once

**Failure:** Awaiting a query, calling `.exec()`, or chaining after partial execution issues duplicate database reads or writes.

**Symptoms:**

- Integration tests show doubled query count.
- Hooks run more than once.
- `findOneAndUpdate` mutates twice.
- Change stream tests receive duplicate updates.

**Prevention:**

- Memoize execution inside `MongoQuery`.
- Make mutating operations return promises directly instead of query objects unless MongoDB semantics require query-like behavior.
- Add tests that await the same query twice and assert one native call.

**Recovery:**

- Restrict `MongoQuery` to read operations and explicitly special-case `findOneAndUpdate`.
- Throw if callers attempt to mutate query options after execution begins.

### 7. `lean(false)` Becomes A False Promise

**Failure:** The hydrated wrapper looks like a Mongoose document but does not support enough mutation behavior for migrated ExampleApp call sites.

**Symptoms:**

- ExampleApp code mutates properties directly and expects `.save()` to persist.
- Nested mutations are lost.
- Instance methods from old schemas are unavailable.

**Prevention:**

- Do not claim Mongoose document parity.
- Name and document it as `MongoDocument<T>`.
- Provide explicit `.set()` and `.toObject()` first.
- Add ExampleApp parity tests for known `lean(false)` call sites before converting them.

**Recovery:**

- Convert migrated call sites from direct property mutation to `.set()`.
- Add narrow document helper methods only when they are cleaner than repository methods.

### 8. Hooks Create Hidden Write Amplification

**Failure:** Hooks that emulate Mongoose plugins perform extra reads/writes in common write paths, causing slow updates or recursive updates.

**Symptoms:**

- Updating one board node triggers many unrelated writes.
- Hooks recursively trigger themselves.
- Meilisearch or count sync runs more often than before.

**Prevention:**

- Include operation metadata in hook context.
- Provide a hook option to skip hooks for internal maintenance writes.
- Add tests that assert hook execution count.
- Keep count/computed-field logic explicit and batched.

**Recovery:**

- Add `skipHooks` options to internal repository writes.
- Move expensive post-write work to background tasks where possible.

### 9. Soft Delete Semantics Drift

**Failure:** Soft-deleted documents leak into normal reads, or explicit deleted reads stop working.

**Symptoms:**

- Boards/nodes/users marked with `deletedAt` appear in normal UI queries.
- Purge jobs cannot find deleted documents.
- Counts disagree with list results.

**Prevention:**

- Apply default soft-delete filters in one query-planning layer.
- Test `find`, `findOne`, `countDocuments`, and aggregate entry points.
- Provide explicit `{ deleted: true }` and `{ withDeleted: true }` options with documented semantics.

**Recovery:**

- Audit query builder filter merge order.
- Add a temporary runtime warning when a filter includes `deletedAt` and options also request deleted behavior.

### 10. Populate Produces N+1 Queries Or Wrong Shapes

**Failure:** `populate()` fetches one referenced document at a time, mis-handles arrays, overwrites ObjectIds unexpectedly, or returns shapes that break existing ExampleApp methods.

**Symptoms:**

- Organization and friends methods become slow.
- Populated array ordering changes.
- Missing references throw instead of returning `null`.
- Projections include sensitive fields.

**Prevention:**

- Batch by target collection and foreign field.
- Preserve input array order during merge.
- Test single refs, array refs, missing refs, projection strings, object projections, and repeated refs.
- Require explicit registered references; do not infer collection names from field names.

**Recovery:**

- Add collection-level `populateDefaults` only for repeated safe projections.
- Convert high-risk call sites to explicit manual repository queries.

### 11. Change Streams Leak Resources

**Failure:** Watchers reconnect forever after shutdown or keep sockets/timers alive across tests and server restarts.

**Symptoms:**

- Vitest hangs after MongoDB integration tests.
- Server close returns but process remains alive.
- Reconnect logs continue after shutdown.

**Prevention:**

- Registry owns every watcher close handle.
- Reconnect loops check an `isClosed` flag before scheduling.
- `registry.close()` closes streams before closing owned clients.
- Tests assert no reconnect after close.

**Recovery:**

- Add a kill switch to the resilient watcher.
- Ensure test teardown calls registry close even when assertions fail.

### 12. Change Stream Resume Logic Loses Or Duplicates Events

**Failure:** Resume tokens are saved too late, reused incorrectly, or discarded on transient errors.

**Symptoms:**

- Clients miss document updates during MongoDB primary changes.
- Clients receive duplicate events after reconnect.
- Watcher crashes permanently on invalid resume token.

**Prevention:**

- Save resume token immediately on each change before invoking user handlers.
- Catch invalid resume token errors and restart without resume only when MongoDB reports that recovery is impossible.
- Include event IDs in emitted payloads so clients can deduplicate if needed.

**Recovery:**

- Reset stream without resume token and emit a server warning.
- Add a diagnostic event or log for watcher recovery mode.

### 13. Bifrost Event Authorization Is Bypassed

**Failure:** `@MongoWatch` emits events on channels that clients can subscribe to without the intended `protected`, `user`, or custom `shouldSubscribe` checks.

**Symptoms:**

- A user can subscribe to another user's document change channel.
- Event options differ from current ExampleApp watcher behavior.

**Prevention:**

- Require `eventOptions` in high-risk watchers or provide safe defaults.
- Register events through `server.addEvent(event, eventOptions)`.
- Add integration tests for protected/user channel subscriptions.
- Keep channel derivation explicit through `getChannel`.

**Recovery:**

- Make unsafe watcher definitions fail registration in strict mode.
- Add a migration audit that lists every watcher and its event authorization.

### 14. Bifrost Event Payload Shape Breaks Clients

**Failure:** Change stream payloads differ from ExampleApp's current `{ eventId, _id, doc, deleted }` contract.

**Symptoms:**

- Existing React `useObject` and subscription code stops refreshing correctly.
- Delete events are interpreted as updates.
- Same-millisecond updates do not refresh as expected.

**Prevention:**

- Preserve current payload fields.
- Keep `eventId` stable and serializable.
- Add client-facing integration tests that subscribe through Bifrost rather than only inspecting server calls.

**Recovery:**

- Add a payload compatibility adapter before the event is emitted.
- Version new payload fields without removing old ones.

### 15. Native Driver Escape Hatch Bypasses Invariants

**Failure:** Consumers overuse `repository.native` and bypass schema validation, timestamps, hooks, soft delete, and events.

**Symptoms:**

- Data invariants drift over time.
- Change streams still emit, but documents are missing expected fields.
- Tests pass at repository level but fail after raw migration writes.

**Prevention:**

- Name the escape hatch explicitly as `native`, not as the default path.
- Document which invariants are bypassed.
- Prefer repository helpers for common raw patterns.
- Use native access intentionally in migrations and bulk maintenance jobs.

**Recovery:**

- Add repository-level bulk methods where raw access becomes common.
- Add audit scripts or tests for required fields after migrations.

### 16. Index Creation Blocks Startup

**Failure:** Registering collections creates or modifies indexes synchronously during server startup, delaying availability or failing production boot.

**Symptoms:**

- Server readiness waits on slow index builds.
- A single index creation failure prevents unrelated methods from serving.
- Deployments fail during foreground index builds.

**Prevention:**

- Make index synchronization configurable.
- Default to safe `createIndexes` behavior and avoid destructive index changes.
- Expose `registry.ensureIndexes()` so applications can run it explicitly.
- Do not drop indexes automatically.

**Recovery:**

- Disable automatic index creation in production config.
- Move index reconciliation to a migration or deployment step.

### 17. Transactions And Sessions Are Under-Specified

**Failure:** ExampleApp or future consumers need MongoDB transactions, but the repository API does not thread `ClientSession` through queries and writes.

**Symptoms:**

- Call sites drop to `native` for all transaction work.
- Writes inside a transaction accidentally execute outside it.

**Prevention:**

- Add a first-class optional `session` option to repository operations and query builders.
- Add `registry.withTransaction(fn)` as a typed helper.
- Test transaction option propagation even if full transaction integration is deferred.

**Recovery:**

- Add session-aware overloads before migrating transaction-sensitive ExampleApp paths.
- Keep transaction-heavy code on native driver until repository support is verified.

### 18. Aggregation Typing Gives False Safety

**Failure:** `aggregate<TResult>()` appears type-safe but cannot prove pipeline output shape.

**Symptoms:**

- Consumers trust incorrect aggregate result types.
- Runtime output differs from declared generic type.

**Prevention:**

- Make `aggregate<TResult = unknown>()` explicit about caller-owned output typing.
- Encourage parsing aggregate output with Zod when it crosses a boundary.
- Do not infer aggregate output from source collection type.

**Recovery:**

- Add `aggregateParsed(schema, pipeline)` if repeated aggregate validation appears in ExampleApp.

### 19. Build Output Breaks Package Consumers

**Failure:** `dist/mongodb` declarations or ESM imports reference source files, omit `.js` suffixes, or fail subpath export resolution.

**Symptoms:**

- ExampleApp must alias `node_modules/@example-app/bifrost/src`.
- `node --input-type=module` cannot import the built package.
- TypeScript resolves source instead of declarations.

**Prevention:**

- Add explicit package subpath exports.
- Run `bun run build` after every package-surface change.
- Inspect generated `dist/mongodb/*.js` and `*.d.ts`.
- Keep `scripts/prepare-dist.mjs` compatible with nested subdirectories.

**Recovery:**

- Fix build output before publishing.
- Treat any consumer source alias requirement as a release blocker.

### 20. Optional Peer Dependencies Become Required At Runtime

**Failure:** Browser or non-MongoDB server consumers import `@example-app/bifrost/client`, `react`, `lit`, or `server` and crash because `mongodb` is loaded eagerly.

**Symptoms:**

- Bundlers include MongoDB driver in client bundles.
- Importing unrelated Bifrost subpaths fails when `mongodb` is absent.

**Prevention:**

- Keep all MongoDB imports inside `src/mongodb`.
- Do not re-export MongoDB package symbols from root Bifrost exports.
- Use type-only imports where possible.
- Keep `mongodb` optional in peer dependency metadata.

**Recovery:**

- Move eager runtime imports behind dynamic imports or into the subpath only.
- Add a browser import smoke test for non-MongoDB subpaths.

### 21. Test Suite Requires A Fragile MongoDB Environment

**Failure:** Integration tests depend on a specific local MongoDB topology or replica set and fail in CI.

**Symptoms:**

- Change stream tests pass locally but fail in Forgejo.
- CI cannot resolve MongoDB hostnames.
- Tests hang when replica set is unavailable.

**Prevention:**

- Separate unit tests from MongoDB integration tests.
- Reuse existing CI MongoDB setup patterns.
- Skip change-stream integration tests with a clear environment diagnostic when replica set support is absent.
- Keep unit coverage for watcher logic with mocked streams.

**Recovery:**

- Add a minimal Docker/CI recipe for MongoDB replica set.
- Mark environment-specific failures as setup failures, not product behavior failures.

### 22. ExampleApp Migration Leaves Mixed Mongoose And Bifrost Models

**Failure:** Some models use Mongoose while others use Bifrost MongoDB, causing inconsistent ObjectIds, hooks, connection lifecycles, and test setup.

**Symptoms:**

- Two MongoDB clients connect to the same database.
- Some change streams are Mongoose-backed and others are Bifrost-backed.
- Tests drop collections through one registry while another still holds models.

**Prevention:**

- Migrate in direct rollout order: package, connection, simple collections, plugins, complex collections, watchers, dependency removal.
- Use `rg "mongoose|HydratedDocument|Schema|Model|QueryWithHelpers"` as a hard gate before removing Mongoose.
- Keep path-limited commits so rollback is possible.

**Recovery:**

- Temporarily isolate the two systems behind separate imports and close both in teardown.
- Do not remove Mongoose until the grep gate is clean.

### 23. Migrations Lose Raw Bulk Behavior

**Failure:** Rewriting migrations through repository APIs changes bulk operation semantics, update operators, or performance.

**Symptoms:**

- Historical migrations become slower.
- `$unset`, `$rename`, `$[]`, or aggregation pipeline updates behave differently.
- Migration tests fail on older data shapes.

**Prevention:**

- Prefer `repository.native` for existing migration bulk operations.
- Do not force old migrations through schema validation.
- Keep migration code close to MongoDB driver semantics.

**Recovery:**

- Revert migration call sites to native collection methods.
- Add migration-specific integration tests for affected migrations.

### 24. Auth And Session Semantics Drift

**Failure:** Session revocation, token refresh, login, passkeys, or OAuth flows change behavior during the data layer migration.

**Symptoms:**

- Users remain logged in after revocation.
- Refresh token families are not invalidated.
- OAuth authorization codes are not expired or revoked correctly.
- Passkey challenge reads/writes fail because ObjectIds or TTL indexes differ.

**Prevention:**

- Treat auth/session collections as high-risk migration targets.
- Preserve TTL indexes.
- Add regression tests around session revocation and OAuth token flows.
- Keep Bifrost `disconnectUser` behavior unchanged.

**Recovery:**

- Pause broad migration and fix auth/session parity first.
- Add compatibility adapters for old token/session document shapes.

### 25. Search And External Side Effects Drift

**Failure:** Plugins currently syncing Meilisearch, counts, computed fields, files, or billing side effects stop running or run at the wrong time.

**Symptoms:**

- Search index misses new or updated documents.
- Board counts drift.
- Computed fields are stale.
- Stripe/customer updates write partial user data.

**Prevention:**

- Identify every plugin with external side effects before converting complex collections.
- Add focused tests for side-effect timing.
- Prefer after-commit style post-write hooks for external systems.
- Keep idempotency in side-effect hooks.

**Recovery:**

- Add reconciliation jobs for search index and counts.
- Re-run affected sync jobs after deployment.

### 26. Performance Regressions Under Common Board Workloads

**Failure:** Repository abstraction adds overhead to high-volume board, node, edge, and chat operations.

**Symptoms:**

- Board load latency increases.
- Node drag/update workflows become slower.
- Change stream event volume increases.
- CPU usage rises from schema parsing on every read.

**Prevention:**

- Validate writes, not every read by default.
- Batch populate and side-effect work.
- Add focused performance checks around board list/open operations.
- Use native collection access for high-volume maintenance paths.

**Recovery:**

- Add opt-in read parsing.
- Cache compiled query plans where safe.
- Move heavy hooks to background processing.

### 27. Security Regressions In Field Projection

**Failure:** Population or query projection returns fields previously excluded by Mongoose `select: false` or method-specific projections.

**Symptoms:**

- Password hashes, token hashes, passkey internals, or billing details appear in API responses.
- OAuth token hashes become query-visible.

**Prevention:**

- Do not rely on schema-level `select: false`; define protected fields in Bifrost MongoDB metadata.
- Add collection-level default projection deny lists for sensitive collections.
- Add tests for user/session/OAuth field projection.

**Recovery:**

- Add immediate deny-list projection to affected repositories.
- Audit emitted Bifrost method responses and logs for leaked fields.

### 28. Internationalization And UI Copy Are Irrelevant But Accidentally Touched

**Failure:** The migration touches UI surfaces, user-facing copy, or locale files as collateral damage.

**Symptoms:**

- Locale files change without a product reason.
- UI tests fail from unrelated copy changes.

**Prevention:**

- Keep this work server/package scoped.
- Do not alter UI copy unless a migration error message becomes user-facing.

**Recovery:**

- Revert unrelated UI/locale changes before committing.

### 29. Protocol Governance Is Accidentally Violated

**Failure:** The implementation changes Bifrost wire protocol behavior or event envelope shapes in core utilities without updating `PROTOCOL.md`.

**Symptoms:**

- Existing clients no longer decode events.
- Python/Rust conformance tests fail.
- Wire payloads change outside MongoDB package boundaries.

**Prevention:**

- Keep MongoDB event payloads inside normal Bifrost event params.
- Do not change `Presentation`, `MessageType`, default methods, EJSON tags, or cache keys.
- If a core protocol change becomes necessary, update `PROTOCOL.md` in the same commit.

**Recovery:**

- Revert protocol changes unless explicitly required.
- Add conformance fixtures for any intentional protocol change.

### 30. Release Versioning And Publishing Fail

**Failure:** The package is built correctly but cannot be published because versioning or immutable package registry constraints are ignored.

**Symptoms:**

- Forgejo npm rejects republishing the same version.
- Consumers install an old package without MongoDB exports.

**Prevention:**

- Bump `bifrost-ts/package.json` before publishing.
- Run `bun run build` before publish.
- Verify package contents include `dist/mongodb`.

**Recovery:**

- Bump version again if a failed publish already reserved a version.
- Treat missing `dist/mongodb` as a release blocker.

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

Run in ExampleApp after migration:

```sh
bun run typecheck
bun run test:unit
bun run test:integration
bun run server:build
```

Use focused test commands during implementation:

```sh
cd bifrost-ts
bun run test:unit -- src/mongodb
bun run test:integration -- src/mongodb
```

## Self-Review

- Spec coverage: The plan covers packaging, decorators, registry, schema, repository operations, query behavior, document hydration, hooks, plugins, populate, change streams, ExampleApp migration, verification, and release-surface checks.
- Risk coverage: The Praemeditatio Malorum section documents package, type-system, decorator, schema, ObjectId, query, document, hook, plugin, populate, change-stream, security, performance, migration, CI, protocol, and release failure modes with prevention and recovery paths.
- Placeholder scan: The document intentionally avoids incomplete placeholders and gives concrete files, APIs, commands, risks, mitigations, and acceptance criteria.
- Type consistency: Public API names are aligned across examples and tasks: `MongoRepository`, `createMongoBifrost`, `MongoQuery`, `MongoDocument`, `MongoCollection`, `MongoWatch`, and `registerMongoCollections`.
- Delegation readiness: Each task includes owner, support role, risk tier, files, and verification commands.
- Exploration fit: The first task calls for a Cortex-first explorer only when the implementer has not already mapped the decorator/package surface.
