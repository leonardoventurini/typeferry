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

## Query and mutation surface

`find()` and `findOne()` accept typed Mongo-style selectors. Queries support
nested paths, comparisons, logical and array operators, regular expressions,
sorting, collation, projection, skip, limit, transforms, iteration, and async
convenience methods.

Mutations support replacement updates and `$currentDate`, `$inc`, `$min`,
`$max`, `$mul`, `$rename`, `$set`, `$setOnInsert`, `$unset`, `$push`, `$pushAll`,
`$addToSet`, `$pop`, `$pull`, and `$pullAll`.

The store is intentionally local-only and in-memory. It does not provide
persistence, indexes, aggregation, transport synchronization, publications, or
implicit React bindings.

See `NOTICE.md` for required attribution covering inherited algorithmic work.
