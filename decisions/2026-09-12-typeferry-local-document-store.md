# TypeFerry-owned local document store

Status: Accepted

Project: `typeferry`

Project root: `/Users/leonardo/Repositories/typeferry`

## Context

The `typeferry/minimongo` subpath began as an external compatibility surface.
That imposed identity, observation, extension-port, and edge-case contracts that
did not follow TypeFerry's client conventions or event-driven design.

TypeFerry already represents default MongoDB ObjectIds as strings at ordinary
client boundaries. Its runtime also consistently exposes explicit event
emitters. Local application state should follow those conventions without
becoming coupled to transports, remote events, or MongoDB publications.

## Decision

Keep the established `typeferry/minimongo` import path but define its behavior
exclusively as a TypeFerry contract.

`LocalCollection` stores deeply frozen, deeply readonly document snapshots.
Every `_id` is a lowercase 24-character hexadecimal string; missing IDs are
generated locally without the MongoDB driver. Unchanged documents retain object
identity across cursor snapshots.

Keep the familiar Mongo-style selector, modifier, projection, and sorting
surface. Remove object and numeric IDs, compatibility profiles and fixtures,
replaceable runtime ports, the old namespace, callback observation APIs,
observer pausing, original-document tracking, and JavaScript `$where`.

Collections emit typed `insert`, `update`, and `remove` events. Active cursors
emit granular `added`, `changed`, and `removed` events followed by one `change`
event containing the complete result. Cursors ignore mutations that do not
change their observable result and detach when their listeners are removed.

This is a direct breaking release without aliases or a deprecation window. The
store remains local-only and does not change `PROTOCOL.md`.

Required MIT attribution remains in the package notice for inherited
algorithmic work. Attribution does not define behavior or compatibility.

## Rejected alternatives

- Preserve the compatibility API while changing internals: this would retain
  the constraints the redesign is intended to remove.
- Add a second local-store import path: two overlapping products would confuse
  ownership and prolong maintenance of the old contract.
- Couple collections to TypeFerry network channels: local state should remain
  useful offline and independent from transport lifecycle.
- Emit collection mutations only: query consumers would repeatedly implement
  filtering, ordering, windowing, and result diffs.
- Emit cursor snapshots only: consumers that need efficient row-level reactions
  would have to diff snapshots themselves.

## Rationale

The design aligns local data with TypeFerry's existing client identity and
event conventions while retaining the productive Mongo-style API. Immutable
snapshots make event payloads stable, prevent consumers from bypassing mutation
events, and enable reference-based rendering optimizations.

## Consequences

- Existing consumers must migrate IDs and observer code in one breaking update.
- The historical import name no longer implies an external behavior contract.
- Event subscriptions keep cursors active until listeners are removed or
  `stop()` is called.
- Query evaluation remains in memory and currently recomputes cursor results on
  relevant collection notifications; structural sharing limits downstream
  rendering work but does not provide indexes.
- Future persistence or remote synchronization requires a separate decision.
- Reverting this decision and its implementation commit restores the former
  optional subpath without affecting wire or persisted data.
