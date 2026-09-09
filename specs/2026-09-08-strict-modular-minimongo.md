# Strict Modular Minimongo

## Problem

TypeFerry needs a browser-safe, in-memory Mongo-style collection exported from
`typeferry/minimongo`. It must reproduce the documented observable behavior of
Meteor 3.5.2's `minimongo` package 2.2.0 while providing strict TypeScript
contracts and explicit internal seams for independently replaceable storage,
query, mutation, value, and observation components.

The implementation must not change TypeFerry's wire protocol or replace the
existing MongoDB live-view materializer in this rollout.

## Evidence

- Meteor 3.5.2 is the current documented release as of 2026-09-08.
- Meteor commit `4e310085974a245837eefec3326e9012edc20309` declares
  `minimongo` 2.2.0 and exports `LocalCollection` and `Minimongo`.
- Upstream public behavior includes selectors, modifiers, projection, sorting,
  collation, `$near`, cursors, sync and async collection methods, ordered and
  unordered observation, pause/resume coalescing, and original-value tracking.
- Upstream explicitly does not provide indexes, aggregation, map/reduce,
  `findAndModify`, complete BSON support, or most geospatial operators.
- TypeFerry's current EJSON clone converts BSON ObjectIds to strings, so the
  compatibility runtime cannot delegate identity-sensitive cloning to it.
- `MongoLiveView` currently owns unordered maps and authoritative ordered
  arrays. Replacing it would combine two independently reviewable changes.

Primary references:

- <https://docs.meteor.com/api/collections>
- <https://github.com/meteor/meteor/tree/4e310085974a245837eefec3326e9012edc20309/packages/minimongo>
- <https://github.com/meteor/meteor/blob/4e310085974a245837eefec3326e9012edc20309/packages/minimongo/NOTES.md>

## Scope

### Included

- `typeferry/minimongo` package export.
- Strict public document, selector, modifier, projection, cursor, transform,
  observer, result, and extension-port types without exported `any`.
- `LocalCollection`, `Cursor`, `Matcher`, `Sorter`, `ObjectID`, and the
  `Minimongo` namespace object.
- String, number, Boolean, null, undefined, and ObjectID identity encoding
  matching Meteor's identity map.
- Selectors: equality, comparisons, `$eq`, `$ne`, `$in`, `$nin`, `$not`,
  `$exists`, `$size`, `$all`, `$elemMatch`, `$mod`, `$type`, `$regex`, logical
  operators, bit operators, function selectors, `$where`, `$comment`, and
  `$near` with legacy and GeoJSON points.
- Modifiers: replacement, `$currentDate`, `$inc`, `$min`, `$max`, `$mul`,
  `$rename`, `$set`, `$setOnInsert`, `$unset`, `$push`, `$pushAll`,
  `$addToSet`, `$pop`, `$pull`, `$pullAll`, and Meteor-compatible rejection of
  `$bit`.
- Sort, skip, limit, projections, transforms, sync and async cursor iteration,
  collection mutation, ordered and unordered observers, pause/resume
  coalescing, and save/retrieve originals.
- Node and browser tests plus compile-time contract tests.
- MIT provenance for derived Meteor behavior.

### Excluded

- Aggregation, indexes, persistence, map/reduce, `findAndModify`, capped
  collections, and unsupported upstream geospatial operators.
- Changes to `PROTOCOL.md` or shared conformance fixtures.
- Replacing `MongoLiveView` storage or adding optimistic remote writes.
- Meteor's private server oplog-analysis helpers.

## Uncertainty and compatibility boundary

Exactness means zero divergence over the versioned TypeFerry compatibility
corpus for values, errors, aliases, return values, callback ordering, and async
readiness. No finite corpus proves equivalence for every JavaScript value.

Compile-time contracts intentionally reject malformed or unsafe inputs that
plain JavaScript can still pass. Runtime guards must process those values with
Meteor-compatible results or failures. Environment-dependent `Intl.Collator`
results are compared only within the same runtime.

String-valued `$where` requires dynamic function construction to match Meteor.
It is supported only by the explicit `allowJavascriptWhere` runtime option;
function-valued selectors remain supported by default. The default is `false`
so importing the package does not silently expand TypeFerry's code-execution
boundary.

## Public contracts

```ts
export type MinimongoId = string | number | ObjectID

export type MaterializedDocument<
  TSchema extends object,
  TId extends MinimongoId = MinimongoId,
> = Omit<TSchema, '_id'> & { _id: TId }

export interface MinimongoComponents {
  readonly values: ValueSemantics
  readonly identities: IdentityCodec
  readonly documentStoreFactory: DocumentStoreFactory
  readonly query: QueryEngine
  readonly mutations: MutationEngine
  readonly observers: ObserverEngine
  readonly scheduler: ObserverScheduler
  readonly random: RandomSource
  readonly clock: Clock
}

export function createMinimongo(
  overrides?: Partial<MinimongoComponents>,
): MinimongoRuntime
```

The default `LocalCollection` and `Minimongo` exports bind the compatibility
profile. Custom runtimes are compatible only when their replacements pass the
shared port-contract and differential suites.

`Cursor<TStored, TOutput>` keeps stored/projected fields separate from
transformed results. `observe` receives transformed documents;
`observeChanges` receives untransformed projected field deltas.

## Architecture

```text
LocalCollection / Cursor / Matcher / Sorter
                    |
              MinimongoKernel
                    |
   +----------+-----+------+-------------+
   |          |            |             |
 store      query       mutations     observers
   +----------+-----+------+-------------+
                    |
       value, identity, scheduler, clock,
       random, collation and reactivity ports
```

The compatibility facade owns overloads and public return shapes. The kernel
coordinates operations. Components communicate through typed compiled-query,
mutation-result, and change-batch values instead of reaching into one another's
state.

The default document store preserves insertion order and has no indexes. A
replacement may optimize candidate lookup but must preserve natural iteration
order. Observer callbacks are queued until an operation reaches stable state.
Paused observers diff the final state against a snapshot rather than replaying
intermediate changes.

## Test strategy and acceptance criteria

Testing precedes each implementation slice.

- [ ] A compatibility manifest pins Meteor 3.5.2, minimongo 2.2.0, and commit
      `4e310085974a245837eefec3326e9012edc20309`.
- [ ] Type-contract tests prove selector field/path inference, insertion with
      optional `_id`, retrieved `_id`, projection and transform inference,
      observer payloads, and rejection of invalid field/operator values.
- [ ] Procedurally generated, repository-owned fixtures cover scalar, nested,
      array, identity, selector, modifier, projection, sorting, and operation
      sequence behavior.
- [ ] Runtime tests cover exact error names/messages and thrown-versus-rejected
      behavior.
- [ ] Observer tests cover initial delivery, ordered moves, projected changes,
      pause/resume coalescing, callback ordering, readiness, stopping, and
      mutation from callbacks.
- [ ] Port-contract tests run against the compatibility defaults and test
      replacements.
- [ ] Unit tests, browser tests, typecheck, lint, build, and consumer package
      verification pass.
- [ ] `typeferry/minimongo` imports without MongoDB, React, or transport code.
- [ ] Existing MongoDB live-view tests remain unchanged and pass.
- [ ] The README publishes the compatibility baseline, supported matrix,
      upstream limitations, `$where` security option, and extension rules.
- [ ] Derived code and documentation retain required MIT attribution.

The repository's tests may not execute or copy another repository's test
suite. Differential fixtures, if automated, must be owned and tracked here and
may invoke only a pinned Meteor runtime as an oracle.

## Risks and recovery

- Selector and modifier edge cases can diverge silently. Keep components small
  and land them only with their conformance slice.
- Natural order can change when swapping stores. Require the store contract
  suite before advertising compatibility.
- Object identity and cloning can diverge from TypeFerry EJSON. Keep the value
  adapter local until parity is proven.
- `$where` can execute code. Keep string evaluation opt-in and never pass
  untrusted remote selectors.
- A public export increases package surface. Roll back by removing the export
  and `src/minimongo` before a release; no persisted or wire format is changed.

## Executable checklist

1. Commit this specification and baseline manifest.
2. Add failing strict type and value/identity/store tests.
3. Implement the compatibility runtime and foundational ports.
4. Add failing matcher, sorter, projection, and query tests; implement them.
5. Add failing modifier/upsert tests; implement mutation behavior.
6. Add failing cursor and observer tests; implement reactive behavior.
7. Export `typeferry/minimongo`, document it, and verify package contents.
8. Create the architectural decision record.
9. Run full TypeScript package verification and report every acceptance item.

## Direct rollout

The feature ships as a new opt-in subpath. Existing imports and runtime paths
do not change. Live-view integration remains a later independently specified
rollout.
