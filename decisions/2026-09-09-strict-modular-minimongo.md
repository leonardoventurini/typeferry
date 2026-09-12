# Strict modular Minimongo compatibility runtime

Status: Superseded by
[`2026-09-12-typeferry-local-document-store.md`](2026-09-12-typeferry-local-document-store.md).

## Context

TypeFerry needed a browser-safe local collection with Meteor Minimongo behavior,
strict schema-aware TypeScript contracts, and internal components that can be
replaced independently. Reusing TypeFerry EJSON would collapse BSON ObjectID
values into strings, while coupling the new store to MongoDB live views would
mix local query compatibility with wire-state materialization.

The compatibility baseline is Meteor 3.5.2, `minimongo` 2.2.0, commit
`4e310085974a245837eefec3326e9012edc20309`.

## Decision

Ship an additive `typeferry/minimongo` subpath with:

- `LocalCollection`, `Cursor`, `Matcher`, `Sorter`, `ObjectID`, and the
  Meteor-shaped `Minimongo` namespace;
- schema-aware selectors, modifiers, projections, transforms, observers, and
  materialized identity types;
- a compatibility profile composed from storage, value, identity, query,
  mutation, observer, scheduler, random-ID, clock, and security-policy ports;
- `createMinimongo()` for isolated facades and collection-level component
  overrides;
- an insertion-ordered, index-free default store and recomputed live-query
  diffs that favor behavioral clarity over premature indexing;
- a repository-owned compatibility corpus pinned by a manifest rather than
  executing or copying Meteor's test suite;
- string `$where` evaluation behind an explicit, disabled-by-default option.

The initial rollout does not replace MongoDB live-view materialization and does
not change `PROTOCOL.md`.

## Rejected alternatives

- Import Meteor's package directly: it relies on Meteor package globals,
  Tracker, Random, EJSON, queues, and ID maps and does not expose strict
  replaceable contracts.
- Reuse TypeFerry EJSON for all values: its wire-oriented BSON conversion does
  not preserve Minimongo's identity namespace.
- Replace MongoDB live-view maps immediately: this would combine a new public
  compatibility surface with a wire-state migration and enlarge rollback risk.
- Enable string `$where` by default: exact convenience does not justify silently
  expanding the code-execution boundary.

## Rationale

An additive subpath isolates dependency and rollback risk. Typed ports make
storage or algorithm experiments possible without changing the public facade.
Versioned behavior tests make the meaning of “compatible” reviewable, while the
explicit `$where` switch preserves the only deliberate security deviation.

## Consequences

- Consumers get strict local Mongo-style behavior without React, MongoDB, or
  transport dependencies.
- Custom ports must pass the same cloning, ordering, error, readiness, and
  callback contracts as the defaults.
- The compatibility baseline must be deliberately re-researched and the
  manifest updated before claiming parity with a later Meteor release.
- Tracker integration, MongoDB live-view adoption, persistence, and indexing
  require separate decisions.
- Rollback removes the subpath export and `src/minimongo`; no wire or persisted
  data migration is necessary.
