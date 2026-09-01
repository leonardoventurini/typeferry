# MongoDB Ordered Live Windows

## Goal and scope

Extend MongoDB live publications with stable, reactive `sort`, `skip`, and
`limit` windows. A ready client must equal the authoritative MongoDB query:

```ts
collection.find(filter).sort(sort).skip(skip).limit(limit)
```

The rollout preserves unordered publications and the existing snapshot/delta
  transport. Ordered publications add an atomic positional splice and re-evaluate the
complete bounded window after every collection change so writes outside the
visible window can enter it correctly.

Joins, multi-collection publications, aggregation pipelines, optimistic
writes, and observer sharing remain outside this rollout.

## Evidence and uncertainty

- The current observer maintains an unordered identity map and performs one
  targeted membership read per changed identifier.
- The client materializes documents in a map, so it cannot represent moves.
- The shared source reports every collection change in order and invalidates
  observers on continuity loss.
- MongoDB already owns sort semantics; duplicating BSON comparison in
  TypeScript would be approximate.

Assumptions:

- Ordered publications are explicitly bounded by `limit`.
- `sort` is a non-empty application field-direction object; the runtime
  appends `_id: 1` as its final unique tie-breaker.
- Re-querying one bounded window for each coalesced write burst is acceptable
  for the first ordered implementation.

Risk is high because concurrent writes can change membership and position at
both window boundaries. The main uncertainty is query amplification under
write-heavy collections.

Stop and revise if a consumer requires multi-collection atomicity, an
unbounded ordered result, raw client-authored sort, or exact aggregation
pipeline incrementality.

## Contracts and decisions

### Publication contract

An ordered publication adds a server-only function:

```ts
interface MongoLiveWindow<TStoredDocument> {
  readonly sort: Readonly<
    Partial<Record<Exclude<keyof TStoredDocument, "_id">, 1 | -1>>
  >
  readonly skip?: number
  readonly limit: number
}

window?: (scope: TScope, args: TArgs) => MongoLiveWindow
```

Runtime validation requires:

- at least one sort field;
- only `1` and `-1` directions;
- sort fields are unique top-level stored-document keys and cannot be `_id`;
- the runtime appends `_id: 1` as the final unique tie-breaker;
- integer `skip >= 0`;
- integer `limit >= 1`;
- `skip` and `limit` do not exceed engine capacity settings.

The server, not the client, constructs this contract. Existing unordered
publications omit `window`.

### Ready-state invariant

For an ordered subscription reporting `ready`, its document array is exactly
the latest successfully processed:

```ts
find(filter, { readConcern: { level: "majority" } })
  .sort([...applicationSort, ["_id", 1]])
  .skip(skip)
  .limit(limit)
```

Every delta is a deterministic transformation from the previous array to the
new authoritative array. One `window-splice` operation replaces the differing
middle between the longest equal full-document prefix and suffix:

```ts
{
  type: "window-splice",
  index: number,
  deleteCount: number,
  documents: readonly TDocument[],
}
```

The operation is atomic. Applying it must produce the authoritative new array
exactly; the server asserts this invariant before delivery. A reorder may
replace more than the minimum number of documents, but the bounded operation
is simpler to validate and cannot expose ambiguous pre-batch versus
intermediate indices.

### Query strategy

Unordered publications retain targeted membership reads. Ordered publications
requery their whole bounded window on every change, including changes to
documents not currently visible. This is intentionally database-authoritative:
MongoDB evaluates BSON ordering, collation, filters, and boundary membership.

Snapshot/change handoff retains the existing bounded notice buffer. Buffered
notices are replayed through complete window refreshes before ready.

### Recovery

Source reset, query failure, projection failure, operation invariant failure,
sequence gap, generation mismatch, invalid operation index, or socket pressure
makes the view stale and requires a complete snapshot. No approximate local
repair is accepted.

Rollback removes `window` from publication definitions; the same descriptors
then return to unordered membership semantics without data migration.

## Risks and recovery

- Boundary write omitted → stale/incorrect page → full-window query for every
  notice → reference-model and real Mongo boundary tests → resnapshot on error.
- Duplicate sort keys reorder nondeterministically → mandatory final `_id`
  tie-breaker → validation/type tests → reject publication allocation.
- Positional splice corrupts client array → server post-diff assertion and
  client identity/index guards → deterministic mutation tests → client resync.
- Query amplification overloads MongoDB → hard `skip`/`limit` bounds and
  documented cost → benchmark remains a release follow-up → remove ordered
  window or lower publication limits.
- Snapshot race crosses window boundary → source-first attachment and replay
  through authoritative refresh → blocked-projection race test → fail snapshot.

## Verification gauntlet

Hard gates:

- Invalid window definitions reject before querying.
- Applying the emitted operation batch to the previous array equals a fresh
  authoritative window.
- Insert/delete/update before, inside, and after the window converge.
- Equal primary sort values remain stable by `_id`.
- A write during snapshot projection appears in the ready result.
- Corrupt client indices/identities trigger exactly one resync.
- Existing unordered behavior and wire compatibility remain green.
- Real replica-set integration agrees with a fresh native query after every
  tested transition.

Sensitivity evidence:

- Reverse a move direction or omit boundary refill in the diff and confirm the
  reference-model test fails, then restore the implementation.

Commands:

```sh
cd typeferry-ts
bun run test:unit -- src/mongodb/live
bun run test:integration -- src/mongodb/live
bun run lint
bun run typecheck
bun run build
bun run test
```

## Execution checklist

- [x] Add window and positional-operation types and runtime validation.
- [x] Add a deterministic ordered-array diff with postcondition assertion.
- [x] Add authoritative ordered snapshot and refresh behavior to the observer.
- [x] Add guarded positional materialization to the framework-neutral client.
- [x] Cover boundary transitions, moves, duplicate keys, snapshot races, and
      corrupt operations with unit and real MongoDB tests.
- [x] Update protocol, guide, progress record, and architecture decision.
- [x] Run sensitivity check, independent adversarial review, and complete
      verification.
- [x] Commit the integrated rollout with a semantic message.

## Verification and rollout

The feature ships directly when a publication supplies `window`; no feature
flag or migration exists. Production preflight must verify the publication
filter and sort have a suitable compound index, limits match expected write
rate, and source-reset/resync signals are monitored. Rollback is the
application-level removal of `window`.

## Progress record

### 2026-07-27 — execution started

- Lit remains excluded.
- Cortex was unavailable; repository `rg`, AST search, git history, targeted
  reads, and independent sidecars supplied the architecture evidence.
- Highest-risk oracle: emitted positional operations must transform the prior
  array into the fresh MongoDB window exactly.

### 2026-07-27 — implementation and adversarial corrections

- Added typed server-owned `sort`/`skip`/`limit`, runtime capacity validation,
  `_id: 1` normalization, authoritative majority-read recomputation, and one
  atomic splice with a server-side postcondition assertion.
- Added guarded ordered client materialization without changing unordered set
  behavior or the React adapter contract.
- Independent architecture review selected full-window recomputation and a
  common-prefix/suffix splice over targeted membership maintenance and
  independent move operations.
- Independent adversarial review initially blocked rollout on legacy-client
  compatibility, ObjectId/string collision, and unbounded ordered work.
- Added explicit `ordered-window-splice-v1` and `typed-object-id-v1`
  capabilities. Legacy unordered clients retain their old ObjectId form;
  ordered subscriptions require both capabilities.
- ObjectIds now use `{ $objectId: string }` for capable clients, remaining
  distinct from equal-looking native string IDs.
- Ordered notices now coalesce to at most one running and one dirty refresh.
  Source reset bypasses that work queue and marks the observer stale
  immediately.
- Added negative-control evidence showing targeted deletion without boundary
  refill fails the authoritative-window oracle.

### 2026-07-27 — verification

- `bun run lint` — passed.
- `bun run typecheck` — passed, including rejection of `_id` in typed
  application sorts.
- `bun run build` and direct emitted ESM imports of MongoDB and React — passed.
- Targeted unit and replica-set integration suites passed after every
  adversarial correction.
- `bun run test` — passed end to end:
  - unit: 109 files, 1,535 tests;
  - integration: 11 files passed, 1 capability-skipped; 55 tests passed and 5
    existing capability-dependent tests skipped;
  - browser: 2 files, 9 tests.
- Real MongoDB coverage verifies ordered snapshot handoff, insertion before
  the window, movement across a boundary, deletion/refill, projected changes,
  duplicate sort values resolved by `_id`, projection secrecy, and final
  equivalence with a fresh majority-read native cursor.
- Deterministic coverage verifies atomic splice postconditions, invalid and
  duplicate client state, legacy capability rejection, unsafe capacity
  rejection, mixed ObjectId/string identities, burst coalescing, reset
  priority, boundary refill, and unchanged unordered semantics.
