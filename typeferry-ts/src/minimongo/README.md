# TypeFerry local collections

`typeferry/minimongo` is TypeFerry's browser-safe, framework-neutral local
document store. The import path is stable package history; the behavior is
defined only by TypeFerry's types, tests, and documentation.

It provides immutable documents, Mongo-style selectors and modifiers, and
typed events without importing TypeFerry transports, React, or the MongoDB
driver.

```ts
import { LocalCollection } from 'typeferry/minimongo'

interface Task {
  title: string
  priority: number
  details: {
    done: boolean
  }
}

const tasks = new LocalCollection<Task>('tasks')
const id = tasks.insert({
  title: 'Ship local collections',
  priority: 1,
  details: { done: false },
})

tasks.update(id, { $set: { 'details.done': true } })

const urgent = tasks.find(
  { priority: { $lte: 2 } },
  { sort: { priority: 1 } },
)

console.log(urgent.fetch())
```

## IDs and immutable documents

Every document has a lowercase, 24-character hexadecimal string `_id`. This is
the client representation TypeFerry uses for the default MongoDB ObjectId
identity. `insert()` generates an ID when none is supplied and rejects IDs in
other formats. The local package does not import the MongoDB driver.

Inserted values are cloned before storage. Materialized documents and event
payloads are deeply readonly and frozen. Unchanged documents retain their
identity across query snapshots, which makes reference comparison useful in UI
and state-management code.

```ts
const before = urgent.fetch()

tasks.insert({
  title: 'Unrelated task',
  priority: 10,
  details: { done: false },
})

const after = urgent.fetch()

console.log(before[0] === after[0]) // true
```

## Collection events

Collections follow TypeFerry's `on`, `off`, `once`, `onAny`, and `offAny`
event-emitter conventions. Events contain immutable snapshots.

```ts
tasks.on('insert', ({ document }) => {
  console.log('inserted', document._id)
})

tasks.on('update', ({ previous, document }) => {
  console.log('changed', previous, document)
})

tasks.on('remove', ({ document }) => {
  console.log('removed', document._id)
})
```

Collection events are emitted before dependent cursors publish their updated
results.

## Cursor events

A cursor starts observing its collection when its first event listener is
added. It stops automatically after all listeners are removed, or explicitly
with `cursor.stop()`.

```ts
urgent.on('added', ({ document, index }) => {
  console.log('entered query', document, index)
})

urgent.on('changed', ({ previous, document, previousIndex, index }) => {
  console.log('changed inside query', previous, document, previousIndex, index)
})

urgent.on('removed', ({ document, index }) => {
  console.log('left query', document, index)
})

urgent.on('change', documents => {
  console.log('complete result snapshot', documents)
})
```

Granular events describe rows entering, changing within, or leaving the result.
The `change` event follows them once with the complete result snapshot. A
mutation that does not affect the query result emits nothing from that cursor.

## API reference

### `LocalCollection<TSchema>`

Create a collection with an optional diagnostic name:

```ts
const tasks = new LocalCollection<Task>('tasks')
```

`TSchema` describes insertable application fields. Materialized documents add
a readonly string `_id` and recursively make schema fields readonly.

| Member | Result | Behavior |
|---|---|---|
| `name` | `string \| undefined` | The name supplied to the constructor. It does not create persistence or a global registry. |
| `insert(document)` | `string` | Clones, validates, freezes, and inserts one document. Generates `_id` when omitted. Emits `insert`. |
| `insertAsync(document)` | `Promise<string>` | Async convenience form of `insert`; the mutation and event happen synchronously before the promise settles. |
| `find(selector?, options?)` | `Cursor` | Creates a lazy cursor. Calling `find()` with no arguments selects all documents. |
| `findOne(selector?, options?)` | document or `undefined` | Returns the first matching result after options are applied. Calling `findOne()` with no arguments selects all documents. |
| `findOneAsync(selector?, options?)` | `Promise<document \| undefined>` | Async convenience form of `findOne`. |
| `countDocuments(selector?, options?)` | `Promise<number>` | Counts matching documents after `skip` and `limit`. |
| `estimatedDocumentCount(options?)` | `Promise<number>` | Counts all documents after `skip` and `limit`; no estimate or index is involved. |
| `update(selector, modifier, options?)` | `number` | Updates the first match, or every match with `{ multi: true }`. Emits one `update` per document. |
| `updateAsync(...)` | `Promise<number>` | Async convenience form of `update`. |
| `upsert(selector, modifier, options?)` | `UpsertResult` | Updates matching documents or inserts one derived document. `insertedId` can supply the ID for the insert branch. |
| `upsertAsync(...)` | `Promise<UpsertResult>` | Async convenience form of `upsert`. |
| `remove(selector)` | `number` | Removes every match and emits one `remove` per document. |
| `removeAsync(selector)` | `Promise<number>` | Async convenience form of `remove`. |
| `on`, `once`, `off` | collection | Adds or removes a typed listener and supports chaining. Duplicate registration of the same listener is ignored. |
| `onAny`, `offAny` | collection | Adds or removes a listener receiving `(eventName, payload)`. |
| `removeAllListeners(event?)` | collection | Removes listeners for one event or for the entire collection. |

`documents()` and `addObserver()` are exposed to satisfy the cursor contract.
They are low-level integration members: application queries should use
`find()`, and application observation should use typed collection or cursor
events. `documents()` returns the current stored snapshots in insertion order.
`addObserver(callback)` returns an unsubscribe function and supplies only an
invalidation signal.

### Collection events

| Event | Payload |
|---|---|
| `insert` | `{ document }` containing the inserted snapshot. |
| `update` | `{ previous, document }` containing the snapshots before and after the update. |
| `remove` | `{ document }` containing the removed snapshot. |

For a multi-document mutation, collection events follow collection iteration
order. Collection events run synchronously after state changes and before
dependent cursor events. A listener exception propagates to the mutating
caller; it does not roll back the completed state change.

### `Cursor<TDocument, TOutput>`

Obtain cursors from `LocalCollection.find()`. Constructing a cursor directly is
not an application API because its collection contract contains package-owned
runtime state.

| Member | Result | Behavior |
|---|---|---|
| `matcher` | `Matcher<TDocument>` | Compiled matcher used by this cursor. |
| `count()` | `number` | Counts the current result after `skip` and `limit`. |
| `countAsync()` | `Promise<number>` | Async convenience form of `count`. |
| `fetch()` | readonly document array | Evaluates and freezes the current result. |
| `fetchAsync()` | promise of readonly document array | Async convenience form of `fetch`. |
| `forEach(callback, thisArg?)` | `void` | Iterates one evaluated snapshot in result order. |
| `forEachAsync(callback, thisArg?)` | `Promise<void>` | Awaits each callback sequentially in result order. |
| `map(callback, thisArg?)` | array | Maps one evaluated snapshot. |
| `mapAsync(callback, thisArg?)` | `Promise<array>` | Awaits each mapping callback sequentially. |
| `getTransform()` | transform or `undefined` | Returns the identity-preserving transform configured through `FindOptions`. |
| `stop()` | `void` | Detaches collection observation and clears the saved result. Existing listeners remain registered. Adding another listener starts observation again. |
| `[Symbol.iterator]()` | iterator | Iterates the result of one `fetch()`. |
| `[Symbol.asyncIterator]()` | async iterator | Asynchronously iterates the result of one `fetch()`. |
| `on`, `once`, `off` | cursor | Manages typed cursor listeners and supports chaining. |
| `onAny`, `offAny` | cursor | Manages listeners receiving `(eventName, payload)`. |
| `removeAllListeners(event?)` | cursor | Removes listeners; removing the last listener automatically stops observation. |

Adding the first listener captures the current result as the baseline. Initial
rows are not emitted as `added`; events describe subsequent mutations.

### Cursor events

| Event | Payload |
|---|---|
| `added` | `{ document, index }` when a document enters the result. |
| `changed` | `{ previous, document, previousIndex, index }` when a result document's visible value changes. |
| `removed` | `{ document, index }` when a document leaves the result. |
| `change` | The complete readonly result array, emitted once after granular events. |

An ordering-only change emits `change` without inventing a row-level change.
Projection and transform output determine whether a cursor-visible document
changed. Every payload and snapshot is frozen.

### Selectors

A selector is either a string document ID or a typed object. Object fields use
dot-separated paths and may contain literal values or operators.

| Group | Supported syntax |
|---|---|
| Comparison | `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin` |
| Presence and negation | `$exists`, `$not` |
| Logical | `$and`, `$or`, `$nor`; `$comment` is accepted and does not affect matching |
| Strings | `RegExp`, `$regex`, `$options`; supported flags are `i`, `m`, and `g` |
| Arrays | Literal element matching, `$all`, `$elemMatch`, `$size` |
| Numbers and binary | `$mod`, `$bitsAllClear`, `$bitsAllSet`, `$bitsAnyClear`, `$bitsAnySet` |
| Value type | `$type` with supported BSON-style aliases or numeric codes |
| Location | `$near`, optional `$maxDistance`, coordinate pairs, and GeoJSON `Point` values |

`$near` uses Euclidean distance for coordinate pairs and meters for GeoJSON
points. It also supplies the default nearest-first ordering when no explicit
sort is provided. JavaScript predicates and `$where` are not supported.

### Find options

| Option | Type | Behavior |
|---|---|---|
| `sort` | object, tuple array, field array, or comparator | Orders results. Directions are `1`, `-1`, `asc`, `desc`, `ascending`, or `descending`. |
| `skip` | `number` | Omits results from the beginning of the ordered result. Defaults to `0`. |
| `limit` | `number` | Caps the returned result after `skip`. |
| `projection` | field map | Includes or excludes fields using `1`/`true` or `0`/`false`. Inclusion and exclusion cannot be mixed except for `_id`. |
| `transform` | function or `null` | Maps every projected document while retaining its original `_id`. It must return an object and cannot replace `_id`. |
| `collation` | `CollationOptions` | Applies `Intl.Collator` string comparison using the required `locale` and supported strength, case, and numeric options. |

Sorting accepts nested paths. Sorting across parallel arrays is rejected.
Projection operators such as `$slice`, `$elemMatch`, and `$meta` are not
supported inside the projection document.

### Mutations

An update can be a replacement document or an operator document, but cannot mix
the two forms. `_id` is immutable. Dot paths are typed from the collection
schema, and positional `.$.` updates use array-match metadata from the selector.

| Operator | Behavior |
|---|---|
| `$set`, `$unset`, `$rename` | Writes, removes, or renames fields. |
| `$inc`, `$mul`, `$min`, `$max` | Applies numeric changes or bounds. |
| `$currentDate` | Stores the current `Date`; accepts `true` or `{ $type: 'date' }`. |
| `$push` | Appends an item or uses `$each`, `$position`, `$slice`, and `$sort`. |
| `$pushAll` | Appends an array of items. |
| `$addToSet` | Adds distinct items; accepts one value or `$each`. |
| `$pop` | Removes from the beginning for a negative argument or the end otherwise. |
| `$pull`, `$pullAll` | Removes array elements matching a value selector or value list. |
| `$setOnInsert` | Applies only when `upsert()` takes its insert branch. |

`UpdateOptions` contains `multi?: boolean`. `UpsertOptions` contains
`multi?: boolean` and `insertedId?: string`. `UpsertResult` always contains
`numberAffected`; `insertedId` is present only when an insert occurred.

### `Matcher` and `Sorter`

These are exported for advanced query tooling:

```ts
const matcher = new Matcher<Task>({ priority: { $lte: 2 } })
const matches = matcher.documentMatches(task)

const compare = new Sorter<Task>({ priority: 1 }).getComparator()
```

`Matcher.documentMatches()` returns `MatchResult` with `result` and optional
geospatial `distance` or positional `arrayIndices`. `hasGeoQuery()` identifies
a `$near` selector, and `isSimple()` reports whether compilation found only
simple field matching. `isIdSelector(value)` narrows any string to the ID
selector type. It identifies selector syntax; collection mutations separately
validate the required lowercase, 24-character hexadecimal ID format.

`Sorter.getComparator({ distances? })` returns a comparator. The optional
distance map supports nearest-first sorting for geospatial queries. `_getPaths()`
on both helpers exposes their compiled field paths for package tooling; the
underscore marks it as a low-level API.

### Errors

`LocalQueryError` reports invalid selectors, collation, and sort input.
`LocalCollectionError` reports duplicate IDs, invalid projections, and invalid
mutations. It includes optional `field` and `setPropertyError` context when the
failure is tied to a mutation path. Invalid ID formats and cyclic document
values raise `TypeError`.

### Exported types

The entrypoint exports the following type families:

- Documents: `MinimongoId`, `InsertDocument`, `MaterializedDocument`,
  `TransformedDocument`, and `DeepReadonly`.
- Queries: `Selector`, `SelectorValue`, `ComparisonSelector`, `StringSelector`,
  `NumericSelector`, `ArraySelector`, `LogicalSelector`, `FieldPath`,
  `ValueAtPath`, and `MatchResult`.
- Results: `FindOptions`, `Projection`, `SortSpecifier`, `SortDirection`,
  `CollationOptions`, and `CollectionCursor`.
- Mutations: `Modifier`, `UpdateOptions`, `UpsertOptions`, and `UpsertResult`.
- Events: `CollectionInsertEvent`, `CollectionUpdateEvent`,
  `CollectionRemoveEvent`, `CursorAddedEvent`, `CursorChangedEvent`, and
  `CursorRemovedEvent`.

The store is intentionally local-only and in-memory. It does not provide
persistence, indexes, aggregation, transport synchronization, publications, or
implicit React bindings.

## Migrating from the former API

- Change every document identity to a lowercase 24-character hexadecimal
  string and remove uses of the former object identity class.
- Replace observer callback objects with `cursor.on(...)` listeners.
- Replace `fields` with `projection`; cursor events are always reactive.
- Remove compatibility runtime factories, component overrides, observer
  pause/resume calls, original-document tracking, mutation callbacks, predicate
  selectors, and `$where` selectors.
- Treat returned documents as immutable snapshots and perform all changes
  through collection mutations.

See `NOTICE.md` for required attribution covering inherited algorithmic work.
