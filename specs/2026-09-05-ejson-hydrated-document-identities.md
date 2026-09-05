# Preserve identities in hydrated document serialization

## Problem and evidence

EJSON recognizes top-level Mongoose models by constructor name and clones their
`_doc`. Embedded documents have different constructors and contain parent
backlinks. Traversing those internal backlinks visits the parent's ObjectId
before the parent's own `_id` field, causing the shared-reference guard to omit
that field. A downstream board-create response consequently loses its identity.

## Scope, uncertainty, and contracts

Normalize hydrated document storage recursively before visiting runtime internals.
Recognize documents by their existing `_doc` and `$__` structure while retaining
the existing model compatibility path. Do not call user transforms or add a
Mongoose dependency. Keep EJSON tags, ObjectId strings, date representations,
public APIs, and circular/shared-reference semantics unchanged. Procedural
document fixtures reproduce parent backlinks here; the consumer owns integration
verification against its actual Mongoose models. This is TypeScript input
normalization, not a new cross-language wire representation.

## Risks and recovery

Objects deliberately shaped like hydrated documents are normalized to their
document storage. Require both document storage and document state to minimize
false matches; plain objects containing only `_doc` must remain plain objects.
Revert the task commit and publish a new patch version if downstream verification
finds a regression. Do not overwrite an existing published package version.

## Executable checklist and direct rollout

- [x] Add procedural nested-document and parent-backlink regression before fixing.
- [x] Observe missing root identity on the existing serializer.
- [x] Normalize embedded documents without changing shared-reference traversal.
- [x] Verify nested arrays, dates, ObjectIds, and absence of document internals.
- [x] Run EJSON and shared conformance tests, lint, typecheck, split suites,
      build, package dry-run, and security audit; record environmental limits.
- [x] Inspect emitted EJSON implementation and declarations.
- [x] Commit source, tests, this spec, and a decision record.
- [x] Leave version selection and publication to the separately authorized release.

## Verification outcomes

- Red regression reproduced the missing root `_id` with the existing model
  constructor, while the root name survived inside the malformed response.
- Focused EJSON and shared fixture coverage: 13 files, 279 tests passed.
- Full TypeScript suites: unit 112 files / 1483 tests; integration 11 files /
  51 tests; browser 2 files / 9 tests passed. Repository helpers supplied temporary
  MongoDB and Redis. No suite was skipped.
- Pinned Mise Node.js 24.19.0/npm 11.17.0 lint, typecheck, build, package dry-run,
  and archive validation passed. The archive contains 437 allowed files; emitted
  clone code includes the fix and its public declaration is unchanged.
- npm audit reported zero vulnerabilities. No dependencies changed.
- The package-owned `npm run verify:consumer` packed-application smoke passed.
- Real Mongoose consumer verification belongs to the downstream task, outside
  this repository's test invocation and release scripts.
- Publication is blocked by the operator's npm authentication (401), and the
  existing candidate version is already published. The task does not bump a
  version or publish; a packed artifact is available only for diagnostics.
