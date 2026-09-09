# TypeFerry Minimongo

`typeferry/minimongo` is a browser-safe, strict-TypeScript implementation of
the documented public behavior of Meteor 3.5.2 `minimongo` 2.2.0. It provides
an in-memory Mongo-style collection without importing TypeFerry transport,
React, MongoDB-driver, or server code.

```ts
import { LocalCollection } from 'typeferry/minimongo'

interface Task {
  title: string
  priority: number
  tags: string[]
}

const tasks = new LocalCollection<Task, string>('tasks')
const id = tasks.insert({
  title: 'Ship strict Minimongo',
  priority: 1,
  tags: ['typescript'],
})

tasks.update(id, { $addToSet: { tags: 'browser' } })

const urgent = tasks.find(
  { priority: { $lte: 2 } },
  { sort: { priority: 1 } },
).fetch()
```

Inserted documents accept an optional `_id`; materialized documents always
carry one. Selectors, nested field paths, modifiers, projections, transforms,
and observer payloads are inferred from the collection schema. Runtime guards
remain in place for untyped JavaScript callers.

## Compatibility profile

The default profile is pinned to:

- Meteor release `3.5.2`
- `minimongo` package `2.2.0`
- Meteor commit `4e310085974a245837eefec3326e9012edc20309`

The profile includes:

- literal, comparison, logical, array, regex, BSON type, bit, and `$near`
  selectors;
- replacement updates and `$currentDate`, `$inc`, `$min`, `$max`, `$mul`,
  `$rename`, `$set`, `$setOnInsert`, `$unset`, `$push`, `$pushAll`,
  `$addToSet`, `$pop`, `$pull`, and `$pullAll`;
- natural and explicit sorting, collation, skip, limit, nested-array
  projections, identity-preserving transforms, and sync/async iteration;
- sync/async mutations, upserts, ordered and unordered observation,
  pause/resume coalescing, readiness, stop handles, and copy-on-write
  originals;
- string, number, and Minimongo `ObjectID` identities, including Meteor's
  collision-safe identity encoding.

As in upstream Minimongo, this package does not provide indexes, persistence,
aggregation, map/reduce, `findAndModify`, capped collections, `$bit`, complete
BSON type support, or geospatial operators other than `$near`. It also retains
upstream limitations for `$pull`, `$all` with `$elemMatch`, array-aware sort
filtering, and duplicate results from multi-point geo matches.

String-valued `$where` selectors are the sole intentional security hardening:
they are disabled by default because they construct executable JavaScript.
Enable them only for trusted local selectors:

```ts
import { createMinimongo } from 'typeferry/minimongo'

const trusted = createMinimongo({ allowJavascriptWhere: true })
const records = new trusted.LocalCollection<{ score: number }>()
```

Function-valued `$where` and function selectors remain enabled by default.
This package exposes explicit `observe` and `observeChanges` APIs but does not
implicitly bind Meteor's global Tracker runtime.

## Replaceable architecture

`createMinimongo()` binds overrides into an isolated facade. Individual
collections may also receive component overrides.

```text
LocalCollection / Cursor / Matcher / Sorter
                    |
      +-------------+--------------+
      |             |              |
    query        mutations      observers
      |             |              |
      +-------- storage ------------+
                    |
       values, identity, scheduler,
          random ID and clock ports
```

```ts
import {
  createMinimongo,
  meteor352Components,
  type ObserverEngine,
} from 'typeferry/minimongo'

const observers: ObserverEngine = {
  diff(ordered, previous, current, callbacks, identities, values) {
    // Instrument or replace diffing, then preserve the observer contract.
    meteor352Components.observers.diff(
      ordered,
      previous,
      current,
      callbacks,
      identities,
      values,
    )
  },
}

const instrumented = createMinimongo({ observers })
```

A replacement is compatible only if it preserves value cloning, identity
namespaces, natural iteration order, callback ordering, stable-state delivery,
and thrown-versus-rejected behavior. The repository port-contract tests are the
minimum acceptance surface for custom implementations.

The compatibility implementation derives behavior from Meteor's MIT-licensed
Minimongo. See `NOTICE.md` in the published subpath for attribution and the
exact upstream source baseline.
