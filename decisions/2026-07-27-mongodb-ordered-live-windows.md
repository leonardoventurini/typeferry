# MongoDB Ordered Live Windows

## Decision

MongoDB live publications may opt into stable, bounded reactive
`sort`/`skip`/`limit` behavior through a server-owned `window` function.

The engine appends `_id: 1` to the declared top-level field sort, performs a
majority-read full-window query for each coalesced write burst, and sends one
atomic `window-splice` for the differing middle. The client validates and
applies the splice to its authoritative array.

## Why

One change outside the visible window can alter both boundaries. Targeted
reads of only the changed identifier cannot detect insertion before `skip`,
refill after removal, or movement across the window. MongoDB must remain the
ordering oracle because BSON comparison is not safely reproducible in the
client or server runtime.

A single splice derived from the longest equal prefix and suffix transforms
any prior window into the next one without ambiguous multi-operation indices.
It may replace more documents than a minimal move-aware diff, but is easier to
validate and recover.

## Correctness contract

Whenever an ordered view reports `ready`, its array equals:

```ts
find(filter, { readConcern: { level: "majority" } })
  .sort([...applicationSort, ["_id", 1]])
  .skip(skip)
  .limit(limit)
```

The server asserts that applying its generated splice produces the fresh
window. The client rejects invalid bounds or duplicate resulting identities
and performs one complete resync.

Ordered delivery requires the client capability
`ordered-window-splice-v1` and collision-proof identity capability
`typed-object-id-v1`. This prevents a rolling deployment from sending the new
operation or identity form to a legacy materializer.

## Constraints

- `sort` contains one or more unique top-level stored-document fields.
- `_id`, nested paths, `$meta`, collation, and computed sorts are rejected or
  excluded from the typed contract.
- `skip` is a non-negative safe integer no greater than 100,000 by default.
- `limit` is a positive safe integer no greater than the snapshot document
  bound.
- Publications without `window` retain unordered targeted-membership behavior.
- Stored ObjectIds materialize as `{ $objectId: string }`; native string and
  number IDs remain scalar. The type tag prevents valid mixed MongoDB
  identities from collapsing to one client key.

## Rejected alternatives

- Incremental visible-only ranking: cannot refill or observe both boundaries.
- JavaScript BSON comparator: approximate and incompatible with MongoDB query
  semantics.
- Independent added/removed/moved operations: exposes ambiguous intermediate
  indices and a larger corruption surface.
- Unbounded ordered results: incompatible with memory and delivery limits.

## Operational consequences

Every collection notice causes one complete indexed query and projection for
each active ordered observer. Applications must create a compound index
covering filter fields, application sort fields, and `_id`, and should avoid
large offsets or write-heavy use until measured.

Query sharing, keyset windows, batching, aggregation-derived ordering, and
dedicated query-amplification metrics remain future work.

Rollback removes `window` from the publication definition. No data migration
or protocol downgrade is required; the publication returns to unordered set
semantics after clients reconnect.
