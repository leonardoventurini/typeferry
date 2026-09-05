# Normalize hydrated document storage before EJSON traversal

## Context

The EJSON clone adapter already flattens top-level Mongoose model storage.
Embedded document constructors differ and their parent backlinks accidentally
consume parent identities through the ordinary shared-reference guard.

## Decision and rationale

Recognize document storage using non-null `_doc` plus `$__` state, preserving
the previous model-name compatibility path. Recursively clone only `_doc` for
recognized documents. Keep the existing shared-reference and cycle behavior,
ObjectId strings, and date tags. The adapter remains free of an ORM dependency.

## Rejected alternatives

- Fixing individual consumers leaves other RPC and event responses vulnerable.
- Expanding constructor-name lists couples behavior to Mongoose implementation
  names and bundling.
- Calling `toObject()` invokes configurable application transforms and changes
  the existing adapter's raw document-storage contract.
- Changing reference traversal globally would broaden this fix to unrelated
  clone semantics.

## Consequences

Embedded documents, including document arrays, use the same normalization as
top-level documents. Objects intentionally containing both internal markers
match this adapter; ordinary `_doc` properties alone do not. Procedural fixtures
cover the parent-backlink failure in TypeFerry; real ORM integration remains
consumer-owned. No wire tags, public signatures, dependencies, or other language
implementations change.

## Release status

Publication is blocked: the release operator's npm identity check returned
`401 Unauthorized`. The registry already contains `0.10.0`, so a subsequent
authorized release must select a fresh version after authentication is restored.
The locally packed `0.10.0` artifact is diagnostic only and must not be published
or retained as a downstream dependency replacement.
