# MongoDB Live Views MVP

## Decision

TypeFerry ships MongoDB live views as an optional TypeScript extension built on
the existing RPC and event envelopes.

The MVP consists of:

- named, typed, server-owned publications;
- Zod-validated client arguments;
- authorization before query construction;
- majority-read initial snapshots;
- one shared change-stream source per MongoDB collection;
- one authoritative observer per connection subscription;
- semantic `added`, `changed`, and `removed` operations;
- generation and sequence gap detection;
- complete resynchronization after source or delivery uncertainty;
- connection ownership and WebSocket-only lifecycle RPCs;
- count-bounded snapshots and native WebSocket pressure limits;
- a framework-independent client materializer; and
- a thin React `useSyncExternalStore` adapter.

Lit is not part of the implementation because the adapter is being retired.

## Why

The existing `@MongoWatch` bridge reports durable collection changes but does
not maintain query membership or client state. Meteor-like reactive data
requires a snapshot boundary, authoritative membership transitions, delivery
ordering, and a local materialized result.

Named publications keep authorization and field projection on the server.
MongoDB itself evaluates membership, avoiding an incomplete JavaScript
reimplementation of MongoDB query semantics.

## Correctness contract

Whenever a client view reports `ready`:

- its current generation came from a complete server snapshot;
- every applied delta has the same generation;
- sequences are contiguous;
- document identity is source-owned; and
- projected data contains only server-selected fields.

A source reset, sequence gap, generation mismatch, or slow native WebSocket
queue moves the subscription out of `ready`. The recovery operation is a full
resnapshot, not approximate continuation.

Snapshot and targeted membership reads use majority read concern so their
visibility boundary agrees with MongoDB change streams.

## Rejected alternatives

### Raw MongoDB filters from clients

Rejected because it exposes collection structure, complicates authorization,
and makes query cost unbounded by application contracts.

### Reusing `@MongoWatch` as the live-query engine

Rejected because that bridge is a notification primitive. It does not provide
source readiness, membership state, snapshot replay, generation resets, or
client materialization.

### Reimplementing MongoDB selectors in JavaScript

Rejected because subtle selector and BSON semantics would make membership
approximate. The MVP performs targeted `_id + publication filter` reads.

### Sharing observers across connections immediately

Deferred. Sharing can reduce membership reads, but cross-principal projection,
authorization scope, cancellation, and slow-consumer isolation are
load-bearing. The MVP preserves the public seam while using one observer per
connection subscription.

### Polling fallback

Rejected. Successfully registered live publications require MongoDB change
streams on a replica set or sharded deployment. Silent polling would change
latency and capacity behavior without an explicit product contract.

## Operational consequences

- Applications must call `mongo.close()` before `server.close()`.
- The registry owns collection sources, observers, lifecycle listeners, and
  reserved server registrations.
- Default limits are 32 subscriptions per connection, 10,000 documents per
  snapshot, and 2 MiB of native WebSocket buffering.
- Publications remain unordered unless they opt into the ordered-window
  extension recorded in
  `decisions/2026-07-27-mongodb-ordered-live-windows.md`. Joins,
  optimistic/offline writes, and a Minimongo-compatible collection layer
  remain outside the product contract.
- MongoDB live integration tests require a replica set. A standalone local
  deployment can still run ordinary MongoDB integration tests.

## Explicit MVP deferrals and residual risk

- Snapshot document count and snapshot/change handoff notices are bounded, but
  snapshot encoded bytes are not yet independently capped.
- Delivery uses one semantic operation per delta. Server-side batching,
  coalescing, shared observers, and capacity benchmarks remain post-MVP work.
- Source interruption blocks new readiness and invalidates existing views.
  Recovery reopens the stream and requires authoritative resnapshot; seamless
  client continuation across a source error is not promised.
- The MVP exposes no dedicated metrics surface. Applications must treat
  resnapshot controls, code 1013 disconnects, MongoDB errors, and subscription
  failures as operational signals until counters and latency histograms land.
- React has focused adapter lifecycle coverage; browser-specific live-view
  integration remains a future hardening test.

## Verification evidence

The implementation is guarded by:

- compile-time public type inference exercised through the normal TypeScript
  check;
- publication validation and identity tests;
- a deterministic observer race test with a write during snapshot projection;
- semantic membership transition unit tests;
- client materialization, duplicate/gap, resync, and teardown tests;
- server WebSocket ownership, authorization, collision, and cleanup tests;
- React adapter lifecycle tests; and
- real MongoDB replica-set integration covering snapshot, insert, update,
  membership exit, delete, projection secrecy, and snapshot/change handoff.

The exact final commands and results are recorded in
`specs/2026-07-26-mongodb-live-views.md`.
