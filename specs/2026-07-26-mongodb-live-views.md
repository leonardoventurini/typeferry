# MongoDB Live Views for Bifrost

## Goal and scope

Bifrost should support Meteor-inspired, server-authoritative live MongoDB
queries without becoming an ORM or exposing arbitrary client-authored MongoDB
filters.

The direct rollout adds named, typed publications to
`@example-app/bifrost/mongodb`, maintains an authoritative result set for each
active subscription, sends an initial snapshot followed by semantic document
deltas, and exposes framework-independent client state with React and Lit
adapters.

This is intentionally more capable than the current `@MongoWatch` bridge:

- `@MongoWatch` broadcasts a durable MongoDB change as a Bifrost event.
- A live view owns a query, knows which documents are currently in its result
  set, and sends `added`, `changed`, and `removed` operations for that result.
- The client materializes the snapshot and deltas into a coherent local view
  and resynchronizes instead of silently accepting gaps.

The rollout is deliberately unordered. Reactive `sort`, `skip`, `limit`,
positional moves, aggregation pipelines, joins, optimistic writes, offline
writes, and a general-purpose Minimongo clone are outside this contract.
Ordinary one-shot native driver queries continue to support those operations.

## Current state

The TypeScript MongoDB package already provides:

- native typed `Collection<TDocument>` handles;
- connection and collection lifecycle;
- collection, schema, index, and watch decorators;
- change streams with `fullDocument: "updateLookup"`;
- Bifrost event and channel emission;
- reconnect-after-error behavior; and
- ObjectId, validation, timestamp, filter, and find-or-create helpers.

The existing bridge does **not** provide:

- a client-supplied subscription argument contract;
- a server-maintained query membership set;
- an initial snapshot/ready boundary;
- semantic membership transitions;
- client materialization;
- sequence or generation gap detection;
- bounded delivery queues or resynchronization; or
- teardown tied to the requesting connection.

Consequently it can trigger a refetch, but it is not a Meteor-style live data
system.

Relevant implementation:

- `bifrost-ts/src/mongodb/change-streams.ts`
- `bifrost-ts/src/mongodb/registry.ts`
- `bifrost-ts/src/server/methods.ts`
- `bifrost-ts/src/server/event.ts`
- `bifrost-ts/src/client/client-channel.ts`
- `bifrost-ts/src/react/hooks/use-method.tsx`

## Evidence and uncertainty

### External evidence

Meteor publications return cursors or explicitly publish `added`, `changed`,
`removed`, and `ready` messages. Clients materialize those messages in local
collections. Its default server merge strategy keeps per-connection history so
overlapping publications can send deltas. See the current
[Meteor publish/subscribe API](https://docs.meteor.com/api/meteor.html) and
[Meteor data-loading guide](https://guide.meteor.com/data-loading).

Meteor 3.5 prefers MongoDB Change Streams, then falls back to oplog tailing and
polling. Its change-stream observer is limited to unordered observers and
selectors supported by its matcher. See Meteor's
[Change Streams observer driver](https://docs.meteor.com/performance/change-streams-observer-driver).

MongoDB change streams:

- report majority-committed changes;
- carry resumable tokens while the relevant oplog history remains available;
- require the same pipeline and options when resumed;
- may return an `updateLookup` document newer than the specific change event;
- require collection configuration and MongoDB 6+ for pre-images; and
- can lose resumability after history expiry or invalidating collection
  operations.

See the MongoDB
[change-stream manual](https://www.mongodb.com/docs/manual/changestreams/),
[change-event reference](https://www.mongodb.com/docs/manual/reference/change-events/),
and
[production recommendations](https://www.mongodb.com/docs/manual/administration/change-streams-production-recommendations/).

### Assumptions

- Applications prefer named server-owned publications over sending raw MongoDB
  filters from untrusted clients.
- Unordered live sets cover the initial product need. Ordered windows are a
  separate correctness problem and must not be approximated.
- A targeted MongoDB membership query after each relevant change is acceptable
  for correctness. Shared observation and filtering can optimize this later
  without changing public semantics.
- Full resynchronization on Bifrost reconnect is acceptable initially. Resume
  tokens solve MongoDB source continuity, not acknowledgement of delivery to a
  particular browser.
- Each Bifrost server instance may run its own collection change source and
  serve its locally connected clients. Redis fan-out is unnecessary for
  correctness because every instance observes the same MongoDB deployment.

### Main uncertainty

The principal capacity uncertainty is the number of membership checks produced
by:

`relevant collection changes × distinct active live observers`

The rollout therefore includes hard subscription limits, shared observers for
identical authorized query keys, queue bounds, coalescing, lag metrics, and a
load test. If realistic load cannot remain within the declared database and
latency budgets, the architecture must add application-defined change
prefilters or materialized query keys before release.

### Stop conditions

Revise this design before implementation proceeds if:

- ordered `sort`/`skip`/`limit` results are required for the first consumer;
- a publication must combine multiple collections atomically;
- raw client-authored MongoDB filters are required;
- the deployment cannot run replica sets or sharded MongoDB;
- auth changes cannot reliably tear down connection-owned subscriptions; or
- the transport cannot expose enough buffered-byte state to detect a slow
  client.

## Contracts and decisions

### 1. Named publications are the security boundary

Clients subscribe by publication name and validated arguments. They never send
a MongoDB filter, projection, collection name, or aggregation pipeline.

```ts
/** Context passed to a MongoDB live publication for authorization and query construction. */
export interface MongoLiveAuthorizationContext {
  readonly client: ClientNode
  readonly signal: AbortSignal
}

/** An unordered, server-owned MongoDB query exposed as a live publication. */
export interface MongoLiveQuery<
  TDocument extends Document,
  TScope,
  TClientFields extends { readonly _id?: never },
> {
  readonly collection: Collection<TDocument>
  readonly filter: Filter<TDocument>
  readonly project: (
    document: TDocument,
    scope: TScope,
  ) => TClientFields | Promise<TClientFields>
}

/** Canonical identifier preserved from the source document by the live engine. */
export type MongoLiveId = ObjectId | string | number

/** Client-visible document assembled from the source identity and projected fields. */
export type MongoLiveClientDocument<
  TFields extends { readonly _id?: never } = { readonly _id?: never },
> = Readonly<{ _id: MongoLiveId } & TFields>

/** Complete definition registered under one public publication name. */
export interface MongoLivePublication<
  TArgs,
  TScope,
  TDocument extends Document,
  TClientFields extends { readonly _id?: never },
> {
  readonly name: string
  readonly args: z.ZodType<TArgs>
  readonly protected?: boolean
  readonly authorize: (
    context: MongoLiveAuthorizationContext,
    args: TArgs,
  ) => TScope | Promise<TScope>
  readonly observe: (
    scope: TScope,
    args: TArgs,
    context: { readonly signal: AbortSignal },
  ) => MongoLiveQuery<TDocument, TScope, TClientFields>
  readonly queryKey?: (
    scope: TScope,
    args: TArgs,
  ) => string | Promise<string>
}
```

`authorize` runs under the connection-owned abort signal and returns an
immutable, detached authorization scope such as `{ userId, tenantId }`.
Authorization failure returns a generic forbidden error and creates no
observer. The scope MUST NOT contain `ClientNode`, request/response, socket,
mutable auth context, credentials, or a connection-owned abort signal.

`observe` constructs the authoritative query under an observer-owned abort
signal. Its filter and projector may retain only the detached scope and
validated arguments. Disconnecting the subscriber that first created a shared
observer therefore cannot abort or mutate that observer while other
subscribers remain.

`project` is the only path from stored documents to client-visible documents,
so accidental field exposure is reviewable and testable.
Publications are protected by default. A definition must explicitly set
`protected: false` to accept an unauthenticated connection.

`project` does not own `_id`. The engine reads the source document identifier,
validates it as `MongoLiveId`, injects it into the client document, and rejects
a projected `_id` field. This makes identity stable across snapshot, delta,
coalescing, and removal. Projection must be deterministic for the same stored
document and authorization context, must not perform external side effects,
and runs under the publication abort signal and configured concurrency/time
budget.

Identity keys use canonical type-tagged EJSON—ObjectId hex, string, and number
are distinct namespaces—and reject duplicate projected identities. Projected
document equality uses the repository's canonical EJSON representation with
stable object-key ordering and BSON type preservation, not `JSON.stringify`
insertion order or object identity.

`queryKey` enables sharing only when the application explicitly asserts that
two authorized subscribers have the same query and projection. Its value is
server-local and is never trusted from the client. Without it, observers are
connection-private.

Registration produces a generic publication map. Client APIs accept a typed
descriptor exported from shared application code, rather than a loose
publication string, so argument and result types remain inferred without
`any`:

```ts
/** Serializable client contract derived from a server publication definition. */
export interface MongoLivePublicationDescriptor<TName extends string, TArgs, TDocument> {
  readonly name: TName
  readonly __args?: TArgs
  readonly __document?: TDocument
}

/** Infers all registered live publication descriptors by name. */
export type MongoLivePublicationMap = Readonly<
  Record<string, MongoLivePublicationDescriptor<string, unknown, unknown>>
>

/** Validates one unknown tuple element without contravariantly widening callbacks. */
export type ValidateMongoLivePublication<T> =
  T extends MongoLivePublication<
    infer TArgs,
    infer TScope,
    infer TDocument,
    infer TClientFields
  >
    ? TDocument extends Document
      ? TClientFields extends { readonly _id?: never }
        ? T
        : never
      : never
    : never

/** Preserves a heterogeneous const tuple and infers each descriptor independently. */
export function defineMongoLivePublications<
  const TPublications extends readonly unknown[],
>(
  ...publications: TPublications & {
    readonly [TIndex in keyof TPublications]:
      ValidateMongoLivePublication<TPublications[TIndex]>
  }
): MongoLiveDescriptors<TPublications>
```

The tuple constraint remains `readonly unknown[]`; it never asks a concrete
publication callback to accept `unknown` arguments or a
`Collection<Document>`. `MongoLiveDescriptors` is a mapped conditional type
that infers each tuple element independently, preserves its literal `name`,
and emits its exact argument and client-document descriptor. Strict type tests
register at least two publications with different argument, scope, stored
document, and projected field types, then use `@ts-expect-error` to prove wrong
arguments and result assignments fail.

### 2. Use native MongoDB for exact membership

The engine does not implement a JavaScript clone of MongoDB selectors. Every
snapshot and membership read uses `readConcern: { level: "majority" }` so its
visible state agrees with the durability boundary of MongoDB change streams.

For every insert, update, or replace affecting the publication's collection,
the engine asks MongoDB whether the changed identifier still matches:

```ts
collection.findOne({
  $and: [publicationFilter, { _id: changedId }],
})
```

The engine compares this post-state with its maintained membership map:

- absent → present: `added`;
- present → present with a changed projection: `changed`;
- present → absent: `removed`;
- absent → absent: no operation;
- delete with known membership: `removed`.

This remains correct for MongoDB operators that are difficult to reproduce in
JavaScript and does not require pre-images. It also avoids treating
`fullDocument: "updateLookup"` as a historical image. Multiple changes for the
same identifier may be coalesced to its latest authoritative state.

The publication query MUST NOT contain `sort`, `skip`, or `limit`. Supporting
those requires ordered window maintenance and `moved` semantics.

### 3. Separate source, observer, and connection state

The implementation has three ownership layers:

- `MongoLiveSource` — one serialized MongoDB change dispatcher per registered
  collection;
- `MongoLiveObserver` — one optionally shared query, projection, and
  authoritative membership map; and
- `MongoLiveConnectionSubscription` — one client connection's generation,
  sequence, visible state, outbound queue, and snapshot/resync lifecycle.

A `queryKey` shares only the observer. A slow client resets only its connection
subscription. A source reset invalidates every dependent observer and advances
every dependent connection subscription to a new generation.

`BifrostMongoRegistry` owns at most one live-view change source per registered
collection and fans normalized change notices into active publication
observers.

The source:

- consumes `collection.watch()` through a single async iterator;
- establishes readiness before accepting subscriptions;
- records the latest resume token and monotonically increasing in-process
  source sequence;
- lets the MongoDB driver resume errors it handles inside the active cursor;
- when the engine must recreate a cursor, uses the last successfully
  dispatched token with `resumeAfter`, the post-invalidation token with
  `startAfter`, and the exact same database, collection, pipeline, collation,
  and change-stream options;
- classifies resumability using documented MongoDB error labels/codes rather
  than message text and retries with bounded exponential backoff and jitter;
- performs a generation reset after invalidation, history loss, or an
  unrecoverable token;
- exposes current status and lag;
- stops with `mongo.close()`; and
- never blocks registry creation while retrying after an established source
  has failed.

Resume tokens remain in memory. Persisting them provides no correctness value
while client subscriptions are connection-owned and always resnapshot after a
process restart. A future durable-session design must specify client delivery
acknowledgements before it can safely add persistent source checkpoints.

The source updates its resumable token only after its serialized dispatcher has
accepted the corresponding notice. If token compatibility or continuity is
uncertain, it establishes a new source before allowing any dependent
subscription to remain `ready`; all dependent state resnapshots under a new
generation.

### 4. Snapshot and stream handoff

Every connection subscription incarnation has one immutable `generation` and
increasing `sequence`. Resync replaces the incarnation rather than mutating its
generation in place.

Each source and observer is an actor with a single serialized mailbox. Async
MongoDB reads may run outside the mailbox, but every state transition, source
notice, membership revision, and subscriber attachment is committed by one
ordered mailbox command. There are two distinct startup paths.

#### New observer initialization

1. Validate arguments and authorize the named publication under the
   connection signal, producing a detached scope.
2. Construct the observer under its own abort signal and attach it to an
   already-ready collection source.
3. The source mailbox captures watermark `W`, installs the observer as
   `INITIALIZING`, and routes every later notice into its ordered mailbox.
4. Execute the majority-read snapshot and project its documents outside the
   mailbox.
5. Commit the candidate membership map, then enqueue a barrier command `B`
   behind every source notice already routed to the observer.
6. Process notices `(W, B]` through authoritative membership reads. Later
   notices remain ordered behind `B`; none can bypass the mailbox.
7. If the bounded initialization queue overflowed, discard the candidate and
   retry from step 3 within the configured attempt limit.
8. In one observer mailbox command, finish all work through `B`, advance the
   observer revision, and transition `INITIALIZING → LIVE`. Notices after `B`
   remain ordered behind that transition and process normally.
9. Attach the requesting connection using the live-observer path below.

No tail is moved between independently executing queues, so there is no
drain-empty/live-transition interval in which a notice can disappear.

#### Connection attachment to a live observer

Attaching a second subscriber never resets, rebuilds, pauses, or changes the
generation of an already-live shared observer.

1. Create the connection subscription as `SNAPSHOTTING`.
2. In one observer mailbox command, freeze an immutable snapshot of current
   membership at observer revision `R`, register the connection subscription,
   and route every later observer operation into its connection-local queue.
3. Allocate the connection generation and snapshot sequence from that frozen
   cut. Build/encode the snapshot while later operations remain queued.
4. In one connection mailbox command, freeze the snapshot response, assign
   subsequent monotonically increasing delta sequences, and transition
   `SNAPSHOTTING → READY`.
5. Drain queued post-`R` operations in order. They may reach the client's
   already-installed local listener before the RPC response; the client
   buffers them and applies them after the snapshot.

An observer operation cannot pass between the revision cut and connection
registration, and a connection delta cannot pass between snapshot finalization
and the `READY` transition.

Applying buffered identifiers is idempotent. A duplicate insert becomes a
projection comparison, a duplicate removal remains absent, and the final
membership is derived from MongoDB rather than the historical lookup image.

The connection subscription is not ready until its connection-local atomic
handoff completes. Failure to establish either path produces an error; it must
never return a partial ready state or disturb an existing subscriber.

### 5. Reuse existing Bifrost RPC and event envelopes

The feature does not add a new WebSocket message type. This keeps wire-protocol
version 1 compatible and avoids forcing unrelated server implementations to
materialize MongoDB-specific state.

The MongoDB package reserves and registers:

- `mongo:live:subscribe`
- `mongo:live:resync`
- `mongo:live:unsubscribe`
- the internal `mongo:live:delta` event

The subscribe RPC uses the calling `ClientNode` to create a connection-owned
subscription and assign its unguessable subscription channel. Deltas are sent
directly to that node only after authorization; a client cannot authorize
itself by calling `rpc:on`.

Registration fails if any reserved method or event already exists; it never
silently replaces application behavior. Bifrost exposes a narrow,
server-owned `sendInternalEvent(node, event, channel, payload)` API so the
MongoDB package neither reaches into transport internals nor uses
multi-recipient room broadcast. Ordinary `rpc:on` is always denied for the
internal event through a `shouldSubscribe` guard that returns false. The
channel is derived from the server connection UUID plus a validated client
subscription UUID, preventing cross-connection collisions.

Live subscribe, resync, and unsubscribe calls are WebSocket-only. The core
client forces `http: false` and `httpFallback: false`; the server rejects a
call without the owning socket before resolving a publication. This prevents a
transient HTTP `ClientNode` from leaking an observer.

```ts
/** Client request to start or replace one connection-owned subscription. */
export interface MongoLiveSubscribeRequest {
  readonly subscriptionId: string
  readonly publication: string
  readonly args: unknown
}

/** Idempotent request to replace stale connection-local state from its observer. */
export interface MongoLiveResyncRequest {
  readonly subscriptionId: string
  readonly staleGeneration: string
}

/** Initial authoritative state returned by the subscribe RPC. */
export interface MongoLiveSnapshot<TDocument extends MongoLiveClientDocument> {
  readonly subscriptionId: string
  readonly generation: string
  readonly sequence: number
  readonly documents: readonly TDocument[]
}

/** Semantic changes following a snapshot. */
export type MongoLiveOperation<TDocument extends MongoLiveClientDocument> =
  | { readonly type: 'added'; readonly document: TDocument }
  | { readonly type: 'changed'; readonly document: TDocument }
  | { readonly type: 'removed'; readonly id: TDocument['_id'] }

/** Ordered batch sent through the protected live-delta event. */
export interface MongoLiveDelta<TDocument extends MongoLiveClientDocument> {
  readonly type: 'delta'
  readonly subscriptionId: string
  readonly generation: string
  readonly sequence: number
  readonly operations: readonly MongoLiveOperation<TDocument>[]
}

/** Control event sent once transport pressure recovers after a dropped generation. */
export interface MongoLiveResyncRequired {
  readonly type: 'resync-required'
  readonly subscriptionId: string
  readonly staleGeneration: string
  readonly nextGeneration: string
}

/** Payload carried by the internal live event. */
export type MongoLiveEvent<TDocument extends MongoLiveClientDocument> =
  | MongoLiveDelta<TDocument>
  | MongoLiveResyncRequired
```

`changed` carries a complete projected document rather than a partial field
merge. This is less bandwidth-efficient than Meteor's field deltas but avoids
ambiguous nested-field deletion and merge semantics. Coalescing remains
deterministic.

The client installs its delta listener before making the subscribe RPC and
buffers early deltas by `subscriptionId`. After receiving the snapshot it:

- replaces local state with the snapshot;
- discards buffered deltas at or below the snapshot sequence;
- applies later deltas in sequence; and
- requests a full resync on a generation change or sequence gap.

The snapshot response is the `ready` boundary.

`mongo:live:resync` is connection-owned, WebSocket-only, and idempotent for
`subscriptionId + staleGeneration`. Concurrent calls share one promise. It
uses the live-observer attachment algorithm to return a complete
`MongoLiveSnapshot` with `nextGeneration`; it never returns deltas from the
discarded generation. An obsolete request returns the already-current snapshot
or an explicit stopped result, never creates another observer.

The client registers its local channel listener directly and does not call
`rpc:on`. Bifrost adds a live-handle lifecycle registry invoked only after the
socket's authentication result and ordinary channel resubscription have
completed, whether that result is authenticated or unauthenticated. A
protected publication requires the former; `protected: false` accepts either.
Reconnect uses single-flight resubscription per handle; stop or context change
cancels an in-flight resubscribe. Repeated socket open/close events cannot
create concurrent server subscriptions.

### 6. Subscription ownership and teardown

A subscription belongs to exactly one live Bifrost WebSocket connection and
cannot be addressed from another connection. Authentication is required iff
the publication is protected.

The engine stops it on:

- explicit `mongo:live:unsubscribe`;
- socket disconnection;
- `ServerEvents.LOGOUT`;
- `ServerEvents.DISCONNECTION` for the owning node;
- token/context replacement through the existing reconnect, which disconnects
  the old node before the new node subscribes;
- publication error;
- publication replacement using the same client subscription ID; or
- `mongo.close()`.

Teardown aborts publication work, releases its shared observer reference,
clears buffered messages, and is idempotent.
Async cleanup is awaited during normal shutdown.

If Bifrost later supports in-place server context mutation, that change must
first add a server `CONTEXT_CHANGED` event carrying old and new auth identity;
the live engine must tear down the old subscriptions before the mutation
becomes visible. The initial rollout does not infer context changes from a
mutable object.

On reconnect, the client creates a new server subscription using the stable
client-side subscription ID and accepts a full snapshot with a new generation.
No initial claim of cross-process session resumption is made.

### 7. Client materialization is subscription-local

Meteor merges documents from multiple publications into collection-global
Minimongo state. Conflicting top-level fields can therefore resolve
arbitrarily. Bifrost should not inherit that ambiguity.

The core client owns a `MongoLiveView<TDocument>` per subscription:

```ts
/** Observable, immutable client state for one MongoDB live publication. */
export interface MongoLiveViewSnapshot<TDocument> {
  readonly status:
    | 'connecting'
    | 'ready'
    | 'resyncing'
    | 'stopped'
    | 'error'
  readonly documents: readonly TDocument[]
  readonly error: Error | null
}

/** Framework-independent handle returned by a live subscription. */
export interface MongoLiveView<TDocument> {
  getSnapshot(): MongoLiveViewSnapshot<TDocument>
  subscribe(listener: () => void): () => void
  resync(): Promise<void>
  stop(): Promise<void>
}
```

There is no implicit cross-publication merge. Consumers that need a combined
domain view compose subscription-local results explicitly with application
rules.

React exposes `useMongoLivePublication`; Lit exposes a
`BifrostMongoLiveController`. Both reuse the core handle and contain no MongoDB
or transport logic.

### 8. Backpressure is bounded and observable

Live delivery cannot use the current fire-and-forget room broadcast as its
pressure oracle. Bifrost first adds this transport-neutral socket contract:

```ts
/** Result of a transport send used by bounded live delivery. */
export interface BifrostSendState {
  readonly accepted: boolean
  readonly bufferedBytes: number | null
}

/** Sends one frame and reports transport pressure when the runtime exposes it. */
export interface BifrostSocket {
  sendWithState(data: string): BifrostSendState
  getBufferedBytes(): number | null
}

/** Sends one internal event directly and returns the underlying socket pressure. */
export function sendInternalEvent(
  node: ClientNode,
  event: string,
  channel: string,
  payload: unknown,
): BifrostSendState
```

Both Node `ws` and Bun WebSocket adapters report their native buffered byte
count. If a future transport cannot report it, live views are unsupported on
that transport and registration fails explicitly. Live deltas use direct
per-node internal-event delivery and own their bounded queue; they do not use
multi-recipient `RoomRegistry.broadcast`.

`MONGO_LIVE_MAX_QUEUED_BYTES` measures encoded frames still owned by the live
delivery queue. `BifrostSendState.bufferedBytes` measures bytes already handed
to the native WebSocket transport. Both bounds apply independently; moving a
frame from one queue to the other never hides total pressure.
`getBufferedBytes()` is read-only and sends no frame; the slow-consumer grace
timer uses it to observe pressure recovery.

Named constants define defaults and are configurable through
`BifrostMongoOptions`:

- `MONGO_LIVE_MAX_SUBSCRIPTIONS_PER_CONNECTION = 32`;
- `MONGO_LIVE_MAX_OBSERVERS_PER_SERVER = 1_000`;
- `MONGO_LIVE_MAX_SNAPSHOT_DOCUMENTS = 10_000`;
- `MONGO_LIVE_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024`;
- `MONGO_LIVE_MAX_HANDOFF_IDENTIFIERS = 10_000`;
- `MONGO_LIVE_MAX_QUEUED_BATCHES = 256`;
- `MONGO_LIVE_MAX_QUEUED_BYTES = 2 * 1024 * 1024`;
- `MONGO_LIVE_MAX_TRANSPORT_BUFFERED_BYTES = 2 * 1024 * 1024`;
- `MONGO_LIVE_DELTA_FLUSH_MS = 16`;
- `MONGO_LIVE_MAX_OPERATIONS_PER_BATCH = 256`;
- `MONGO_LIVE_MEMBERSHIP_CONCURRENCY = 32`;
- `MONGO_LIVE_RETRY_MIN_MS = 250`;
- `MONGO_LIVE_RETRY_MAX_MS = 10_000`; and
- `MONGO_LIVE_MAX_HANDOFF_RETRIES = 3`; and
- `MONGO_LIVE_SLOW_CONSUMER_GRACE_MS = 30_000`.

These are safety bounds, not performance claims. An application may lower or
raise them explicitly after load evidence.

Changes for the same connection subscription and document may be coalesced
before delivery using that subscription's visible state:

- add + change → add latest document;
- add + remove → no operation;
- change + change → change latest document;
- change + remove → remove;
- remove + add → changed with the latest document when the prior membership
  was visible, otherwise added.

Starting a snapshot or new generation clears the connection-local coalescer.

If the queue or transport buffered-byte limit is exceeded, the engine discards
queued deltas for that connection subscription, changes it to `STALE`, and
allocates exactly one next generation. It stops sending data deltas and polls
only the native transport buffered-byte state within the bounded slow-consumer
grace period.

When pressure falls below the limit, the engine sends one
`resync-required` control event. The client enters `resyncing` and calls the
single-flight `mongo:live:resync` RPC. If the control send is not accepted,
pressure rises again, or the grace period expires, the engine terminates the
connection subscription and closes the WebSocket with standard close code
1013 (`Try Again Later`). Reconnect creates a fresh subscription and snapshot.
The engine never queues snapshots behind a known-blocked socket and never loops
resnapshot work while pressure remains above the limit.

Required metrics:

- active sources, observers, and connection subscriptions;
- source state, restart count, last event time, and lag;
- membership query count, latency, concurrency, and failures;
- snapshots, resnapshots, duration, document count, and encoded bytes;
- handoff retries and overflows;
- delta batches, operations, bytes, queue depth, coalesced operations, and
  dropped generations; and
- subscription authorization, capacity, and slow-consumer failures.

Required structured logs include publication name, opaque subscription ID,
generation, reason, and error category, but never raw arguments, filters,
documents, credentials, or resume tokens.

### 9. Consistency contract

The live view is:

- server-authoritative;
- eventually updated from majority-committed MongoDB change events;
- gap-detecting between Bifrost server and client;
- self-healing through generation resnapshot; and
- unordered.

It does not promise:

- linearizable reads;
- an atomic snapshot across multiple collections;
- read-your-writes before the corresponding majority-committed event;
- exactly-once network delivery;
- persistence across browser restarts; or
- uninterrupted delivery across MongoDB history loss.

At-least-once source observation and network duplication are tolerated through
generation/sequence checks and idempotent document replacement/removal.

## Risks and recovery

### Incorrect query membership

- **Impact:** unauthorized, missing, or stale documents.
- **Prevention:** named server-owned queries; MongoDB-executed membership
  checks; projection before delivery; generation resets.
- **Detection:** model-based state-machine tests compare the client view with a
  fresh authoritative query after randomized writes.
- **Recovery:** stop affected generation and resnapshot. Any authorization leak
  blocks release and requires credential/session review.

### Snapshot/change race

- **Impact:** a document change is absent from the ready view.
- **Prevention:** ready source, bounded handoff buffering, authoritative replay,
  no partial ready state.
- **Detection:** integration tests pause snapshot projection while performing
  insert/update/delete membership transitions.
- **Recovery:** retry the snapshot; fail explicitly after bounded attempts.

### Slow consumers

- **Impact:** unbounded memory growth or stale clients.
- **Prevention:** byte/message limits, coalescing, transport buffered-byte
  inspection, resync, and termination.
- **Detection:** queue and resnapshot metrics plus a deliberately stalled
  WebSocket integration test.
- **Recovery:** discard the affected generation and resnapshot; disconnect
  repeated offenders.

### MongoDB stream interruption or history loss

- **Impact:** missed source changes.
- **Prevention:** in-process driver resumability.
- **Detection:** classified stream errors, resume age, invalidation, and
  source-generation metrics.
- **Recovery:** establish a fresh source, resnapshot every dependent observer
  and connection subscription, and emit new generations.

### Query amplification

- **Impact:** MongoDB load and user-visible latency.
- **Prevention:** explicit query-key sharing, concurrency bounds, capacity
  limits, and coalescing by identifier.
- **Detection:** membership-query amplification and latency metrics under a
  representative load test.
- **Recovery:** reject new subscriptions at capacity and resync overloaded
  observers; do not silently deliver approximate results.

### Multi-node divergence

- **Impact:** clients attached to different Bifrost nodes temporarily observe
  different generations.
- **Prevention:** each node reads the authoritative MongoDB source and applies
  identical publication semantics.
- **Detection:** two-node integration test compares converged views.
- **Recovery:** node-local resnapshot. Redis is not a source of truth for live
  data. The test independently interrupts and restarts each node's source; a
  source recreation always resnapshots its local observers.

## Verification gauntlet

All listed checks are hard gates unless explicitly marked diagnostic.

### Publication authorization and projection

- **Violation:** a client supplies a filter or receives an unprojected field.
- **Oracle:** unit and end-to-end tests with an attacker-controlled argument
  and two authenticated users.
- **Commands:** targeted Vitest unit suite and Playwright-backed browser suite.
- **Pass threshold:** the unauthorized subscription fails generically; no
  forbidden field appears in any snapshot, delta, log, or error.
- **Sensitivity:** seed a projection that returns the secret field and prove
  the security test fails before restoring it.

### Snapshot handoff

- **Violation:** a write during snapshot construction is missing at ready.
- **Oracle:** real replica-set integration test gates projection, performs all
  membership transitions, then releases it.
- **Command:** `bun run test:integration -- src/mongodb/live`
- **Pass threshold:** client materialization equals a fresh native query at
  ready and after drain.
- **Sensitivity:** disable replay in a test-only faulty engine and prove at
  least one transition fails.
- **Cutover control:** inject a notice after the replay worker reports empty
  but before its `INITIALIZING → LIVE` observer command executes, and inject
  another between connection snapshot freeze and `SNAPSHOTTING → READY`; both
  notices must appear in the snapshot or first ordered delta. Attach a second
  subscriber during writes and prove the first subscriber is uninterrupted.
  These deterministic controls specifically prove both atomic transitions.

### Delta state machine

- **Violation:** duplicate, reordered, coalesced, or gapped deltas corrupt the
  client view.
- **Oracle:** property-based model test over snapshot/reset/add/change/remove,
  duplicate, gap, and generation sequences.
- **Command:** `bun run test:unit -- src/mongodb/live`
- **Pass threshold:** every generated trace either equals the model or enters
  `resyncing`; no invalid trace remains `ready`.
- **Sensitivity:** remove the sequence-gap guard and prove the property fails.

### Lifecycle and isolation

- **Violation:** observers leak after disconnect or cross connection/auth
  boundaries.
- **Oracle:** two-client integration tests plus listener/observer counts after
  unsubscribe, disconnect, context change, and shutdown.
- **Pass threshold:** zero leaked connection-owned subscriptions and no
  cross-client event delivery.
- **Cases:** include WebSocket loss during subscribe RPC, forced HTTP fallback,
  logout, token-refresh reconnect, auth failure, repeated reconnect, revocation
  disconnect, an unauthenticated public-publication reconnect, subscriber A
  disconnecting while B continues on their shared observer, and
  `mongo.close()` listener removal.

### Backpressure

- **Violation:** a stalled client causes unbounded queue growth or silently
  misses changes.
- **Oracle:** integration test with a transport that reports a fixed blocked
  buffer.
- **Pass threshold:** declared bounds are never exceeded; the client receives a
  resnapshot or explicit slow-consumer termination.
- **Sensitivity:** disable the queue bound and prove the bound assertion fails.
- **Cases:** cover overflow → pressure recovery → one control event → one new
  snapshot, duplicate resync requests, and permanent pressure → code 1013
  termination without repeated snapshot work. A transport double decreases
  `getBufferedBytes()` without accepting any send, proving read-only recovery
  polling triggers the single control event.

### Source recovery

- **Violation:** a resume failure leaves a ready but stale generation.
- **Oracle:** fake-source unit tests and replica-set interruption integration
  tests for resumable failure, invalidation, and expired resume history.
- **Pass threshold:** resumable failures continue; unrecoverable failures issue
  a new generation and converge by resnapshot.

### Native driver and protocol compatibility

- **Violation:** live views break existing MongoDB helpers, events, RPC, build
  exports, or alternate-language protocol fixtures.
- **Commands:**
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`
  - `bun run test`
  - shared conformance commands documented under `docs/conformance/`
- **Pass threshold:** all existing and new checks pass without weakening a
  safeguard.

### Capacity

- **Classification:** hard gate for declared limits; throughput numbers beyond
  the fixture are diagnostic until an application declares a product latency
  service-level objective.
- **Fixture:** local three-member replica set; 100 observers; 1,000
  subscriptions; 10,000 one-kibibyte documents; 100 uniformly distributed
  writes/second for 60 seconds; 10 deliberately stalled clients.
- **Command:** `bun run bench:mongodb-live -- --duration=60s --writes=100
  --observers=100 --subscriptions=1000 --documents=10000
  --document-bytes=1024 --stalled-clients=10`
- **Pass threshold:** configured safety bounds are never exceeded; every
  non-stalled client converges to a fresh authoritative query; stalled clients
  resync or terminate explicitly; no observer, subscription, or listener
  remains after teardown.
- **Diagnostic outputs:** p50/p95/p99 propagation latency, membership-query
  amplification, MongoDB CPU, process CPU/RSS, queue depth, and resnapshot
  count.

## Execution checklist

- [ ] Define public server/client types and named publication registration —
      files: `bifrost-ts/src/mongodb/live/types.ts`,
      `bifrost-ts/src/mongodb/live/publication.ts`,
      `bifrost-ts/src/mongodb/index.ts`; verify:
      `bun run test:unit -- src/mongodb/live`; done when invalid definitions,
      raw client filters, duplicate names, invalid identifiers, and
      unauthorized resolution are rejected by types or runtime schemas.
- [ ] Implement the shared collection change source —
      files: `bifrost-ts/src/mongodb/live/source.ts`,
      `bifrost-ts/src/mongodb/registry.ts`; verify source recovery unit tests
      and real replica-set integration tests; done when resumable errors
      continue and history loss creates an observable new generation.
- [ ] Implement authoritative observers and snapshot handoff —
      files: `bifrost-ts/src/mongodb/live/observer.ts`,
      `bifrost-ts/src/mongodb/live/engine.ts`; verify gated-snapshot and
      membership-transition integration tests; done when every tested ready
      view equals a fresh native MongoDB query.
- [ ] Implement connection-owned RPC/event delivery and lifecycle teardown —
      files: `bifrost-ts/src/mongodb/live/server.ts` plus the narrow server
      lifecycle/transport hooks required for direct internal-event delivery
      and buffered byte inspection; verify two-client isolation, disconnect,
      auth change, and shutdown integration tests; done when ownership cannot
      cross a connection and all resources reach zero.
- [ ] Implement bounded batching, coalescing, resync, capacity policy, metrics,
      and redacted logs — files: `bifrost-ts/src/mongodb/live/delivery.ts`,
      `bifrost-ts/src/mongodb/live/observability.ts`; verify stalled-client,
      overflow, and load tests; done when bounds hold and overload is explicit
      rather than approximate.
- [ ] Implement framework-independent client materialization and reconnect
      resubscription — files: `bifrost-ts/src/client/mongodb-live-view.ts`;
      verify property tests with duplicates, gaps, generation changes, early
      deltas, and reconnect; done when invalid sequences always resync.
- [ ] Add thin React and Lit adapters — files:
      `bifrost-ts/src/react/hooks/use-mongodb-live-publication.tsx`,
      `bifrost-ts/src/lit/mongodb-live-controller.ts` and package exports;
      verify unit, integration, and browser tests; done when both adapters
      expose identical core state and clean up deterministically.
- [ ] Verify ordered, idempotent shutdown — files:
      `bifrost-ts/src/mongodb/live/engine.ts`,
      `bifrost-ts/src/mongodb/registry.ts`; stop accepting subscriptions, mark
      views non-ready, abort and await snapshots/projections/membership work,
      drain owned delivery tasks, close streams, remove owned server listeners
      and remove reserved registrations only when their object identity still
      matches the live engine, then close the owned Mongo client; verify
      close-during-subscribe, close-during-replay, double-close, and
      disconnect-during-close integration tests; done when no task, listener,
      observer, subscription, or socket write survives closure.
- [ ] Update the MongoDB documentation, package exports, normative protocol
      notes, shared conformance fixtures, and production setup guidance —
      files: `bifrost-ts/src/mongodb/README.md`, `bifrost-ts/package.json`,
      `PROTOCOL.md`, `docs/conformance/`; verify build output imports and every
      conformance runner; done when the existing RPC/event envelopes and new
      default method semantics are documented precisely.
- [ ] Run the complete verification gauntlet and independent adversarial
      review; inspect `git diff`, security tests, metrics, package contents,
      and unrelated work; done when all hard gates pass and every reviewer
      finding is integrated or rejected with evidence.
- [ ] Record the implemented architecture and operational recovery contract —
      file: `decisions/YYYY-MM-DD-mongodb-live-views.md`; verify direct review;
      done when the shipped behavior, rejected alternatives, limits,
      observability, and resnapshot recovery are durable.

## Direct rollout and recovery

This is one integrated rollout, not a sequence of partial product modes.
Server engine, client materialization, adapters, protocol documentation,
observability, limits, and recovery ship together. Deployment enables live
views when at least one named publication is registered; there is no
environment feature flag or silent fallback to polling.

Production preflight:

1. Confirm MongoDB is a supported replica set or sharded deployment.
2. Confirm `find` and `changeStream` privileges for every published
   collection.
3. Declare and load-test snapshot, subscription, queue, and latency budgets.
4. Confirm source, membership, queue, resnapshot, and error metrics are
   collected and alerted.
5. Exercise process restart, MongoDB primary election, expired resume history,
   slow client, and full resnapshot in the target environment.
6. Verify every publication's authorization and projection test with
   production-equivalent roles.

Abort new live subscriptions if the source cannot establish readiness,
membership checks exceed their failure/latency budget, or resnapshot churn
exceeds the declared threshold. Existing views must transition out of `ready`;
they must not remain silently stale.

Rollback removes live publication registrations from application code and
returns consumers to explicit RPC refetch plus the existing `@MongoWatch`
event bridge. Because live views do not mutate MongoDB schemas, create
collections, require pre-images, or own application data, rollback requires no
data migration.
