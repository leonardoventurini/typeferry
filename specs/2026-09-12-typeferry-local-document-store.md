# TypeFerry local document store

## Problem

Project: `typeferry`

Project root: `/Users/leonardo/Repositories/typeferry`

`typeferry/minimongo` is currently designed and documented as a compatibility
implementation of another framework's local database. That constraint does not
serve TypeFerry's local application-state use case and exposes concepts that do
not belong to TypeFerry.

The package needs a TypeFerry-owned contract while retaining its established
import path and familiar collection, cursor, Mongo-style selector, and modifier
shape.

## Evidence

- `src/minimongo/index.ts` exports compatibility profiles, replaceable runtime
  ports, an ObjectID class, and a legacy namespace.
- `LocalCollection` accepts string, number, and object identities and returns
  mutable clones.
- cursor observation follows legacy callback and readiness conventions.
- the repository pins an external compatibility corpus and version manifest.
- TypeFerry's client-facing MongoDB boundary normally represents ObjectIds as
  lowercase hexadecimal strings.

## Desired contract

The public import remains `typeferry/minimongo`.

Documents have string `_id` values. Inserts without `_id` generate lowercase,
24-character hexadecimal IDs compatible with MongoDB ObjectId strings, without
importing the MongoDB driver.

Collections retain Mongo-style selectors, projections, sorting, and modifiers.
They expose immutable document snapshots: public document types are deeply
readonly, returned values are deeply frozen, and unchanged stored documents are
shared across cursor snapshots.

Collections follow TypeFerry's event-emitter conventions and emit typed
`insert`, `update`, and `remove` events. Cursors emit a complete immutable
`change` snapshot plus granular `added`, `changed`, and `removed` result events.
Cursor events fire only when that cursor's result changes.

The store remains browser-safe, framework-neutral, in-memory, local-only, and
independent from TypeFerry transports and the wire protocol.

## Public API direction

Keep:

- `LocalCollection`
- `Cursor`
- Mongo-style selectors and modifiers
- synchronous CRUD and query operations
- familiar `on`, `off`, `once`, and `onAny` event methods

Remove in this breaking release:

- object and numeric identity support
- the client-side `ObjectID` class
- compatibility profiles and manifests
- replaceable compatibility runtime ports and `createMinimongo`
- the legacy `Minimongo` namespace
- legacy observer handles, readiness, pause/resume, original-document tracking,
  callback mutation overloads, and JavaScript `$where`
- compatibility-only aliases and unsupported behavior constraints

The exact retained Mongo operator set is repository-owned. Existing operators
may remain when useful and maintainable; their behavior is specified by local
tests rather than external parity.

## Event model

```text
collection mutation
       |
       +-- collection insert/update/remove event
       |
       +-- each active cursor evaluates its next result
                    |
                    +-- added/changed/removed events
                    +-- one change event with the complete snapshot
```

Every payload is deeply frozen. An update event contains the previous and next
document. Cursor granular events contain documents and stable result indexes.
No cursor event is emitted when its observable result is unchanged.

## Test strategy

Contract tests are written before or alongside implementation and cover:

- generated and supplied ID validation;
- deep readonly types and runtime freezing;
- structural sharing across unchanged query snapshots;
- collection event names, payloads, order, and listener cleanup;
- cursor snapshot and granular events for filters, projections, sorting,
  limits, insertions, updates, removals, and irrelevant mutations;
- retained selectors, modifiers, projections, and sorting;
- absence of removed exports from declarations and the packed package;
- browser-safe import and operation.

Tests derived solely from the old compatibility target are deleted or rewritten
to assert the TypeFerry contract. No configuration tests are added.

## Risks and uncertainty

- This intentionally breaks public APIs. The release notes and documentation
  must provide a direct migration summary.
- Deep freezing must handle Date, RegExp, binary values, arrays, and cyclic input
  safely. Cyclic documents will be rejected because the query and serialization
  model assumes document trees.
- JavaScript cannot make Date and typed-array contents fully immutable through
  `Object.freeze`; the store must isolate those mutable leaf values and avoid
  exposing internal mutable references.
- Keeping the historical `minimongo` import name may imply compatibility that no
  longer exists. Documentation must state that the name is only the stable
  TypeFerry import path.
- Existing MIT attribution remains in `NOTICE.md` for code whose algorithmic
  structure was derived from the prior implementation source. It is legal
  attribution, not a behavioral authority.

## Recovery

The change is isolated to the optional `typeferry/minimongo` subpath, its tests,
documentation, and package verification. Reverting the task commits restores
the former API. There is no wire or persisted-data migration.

## Direct rollout

This is released as a documented breaking change. There is no compatibility
shim or deprecation window. Consumers update imports of removed symbols and
adopt string IDs and event subscriptions before upgrading.

## Executable checklist

- [x] Replace compatibility tests with TypeFerry-owned contract tests.
- [x] Restrict IDs to validated strings and generate ObjectId-compatible strings.
- [x] Materialize deeply frozen, deeply readonly document snapshots.
- [x] Add typed collection mutation events.
- [x] Add cursor snapshot and granular result events.
- [x] Remove compatibility-only public APIs and implementation paths.
- [x] Preserve legal attribution without compatibility claims.
- [x] Update package, architecture, and user documentation.
- [x] Add a decision record superseding the compatibility decision.
- [x] Run focused unit and browser tests.
- [x] Run lint, typecheck, all split suites, build, and package inspection.

## Acceptance criteria

- The documented desired contract is observable through the public package.
- No implementation or product documentation treats the prior framework as a
  source of runtime semantics.
- Only the legal notice and historical/superseded records retain attribution or
  historical context.
- `PROTOCOL.md` and all transport behavior remain unchanged.
- All required TypeScript verification commands pass.

## Verification results

Executed successfully:

- focused local-store unit tests: 19 tests;
- complete unit suite: 1,656 tests;
- complete browser suite: 10 tests;
- ESLint and strict TypeScript typecheck;
- production build and `npm pack --dry-run`;
- repository package verification: 565 allowed files;
- packed application consumer build, test, and runtime import.

The integration suite was executed. Its four environment-independent files and
28 tests passed. Redis and MongoDB integration files could not initialize their
external services in this environment; 23 tests were skipped after connection
timeouts. No local-store test depends on either service.
