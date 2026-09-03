# Protected Live Publication Reliability

## Problem and evidence

VitaFlow's administrator user view receives `INTERNAL_ERROR` from the
protected `mongo:live:subscribe` RPC on its Docker Compose stack. TypeFerry
marks the reserved method sensitive, so the server correctly redacts the
underlying exception from logs and telemetry. Existing real-server live-view
integration coverage registers only public publications; protected publication
authorization and recovery are therefore not exercised through the actual
WebSocket handshake.

The same VitaFlow publication succeeds when its reserved method is invoked
directly against a replica-set test database, which narrows the uncovered
boundary to real transport authentication/lifecycle behavior rather than its
filter, projection, or ordered-window definition.

Post-release reproduction with `0.7.4` reached the initial snapshot and failed
while validating a native BSON ObjectId. The production bundle contained
independently bundled BSON constructors, and the constructor-name heuristic did
not survive bundler symbol rewriting even though `_bsontype` and `toHexString`
retained the BSON ObjectId contract.

## Desired outcome and scope

TypeFerry `0.7.4` must reliably establish protected MongoDB live publications
through an authenticated WebSocket connection and recover them across the
supported connection lifecycle. The fix remains inside the TypeScript client,
server, or MongoDB live extension and preserves the current wire protocol.

Because `0.7.4` was published before the bundled-runtime failure was observed,
the BSON compatibility follow-up ships as `0.7.5`.

Out of scope:

- weakening protected publication authorization;
- exposing sensitive method arguments, results, or exceptions;
- application-specific knowledge or VitaFlow paths in TypeFerry;
- changes to Python, Rust, or the application template;
- publishing the npm package (the operator will release manually).

## Uncertainty and assumptions

The visible server log proves the failing reserved method but intentionally
does not identify the internal exception. The first executable step is a real
authenticated transport regression matching the consumer's lifecycle. If that
does not fail, add the smallest deterministic lifecycle fault that reproduces
the observed terminal error before modifying production behavior.

Assume MongoDB 8 and supported Node driver versions retain documented change
stream behavior. Stop if the correction would require a wire-protocol change,
weaker telemetry redaction, or consumer-specific policy.

## Contracts

- Protected publications accept only authenticated `ClientNode` instances.
- Authorization completes before filters, windows, projections, or change
  sources become observable.
- A transient connection lifecycle transition cannot leave a live view in a
  terminal error when a new authenticated connection is ready.
- Ordered windows, typed ObjectIds, sequence/generation checks, pressure
  controls, and teardown behavior remain unchanged.
- Sensitive method telemetry stays redacted.

## Risks and recovery

- Retry behavior could create duplicate subscriptions or retry storms. Tests
  must prove one active subscription per view and bounded attempts per
  connection generation.
- Retrying authorization failures could conceal a permanent forbidden state.
  Permanent failures remain errors until a later authenticated connection or
  explicit caller retry.
- Change-stream lifecycle changes could lose the snapshot handoff. Existing
  source, observer, and real replica-set tests remain mandatory.

Rollback is the release commit revert. The patch changes no persisted data and
requires no migration.

## Executable checklist

- [x] Add a real authenticated WebSocket live-publication regression.
- [x] Demonstrate the regression fails against the pre-fix behavior.
- [x] Implement the smallest framework-owned correction.
- [x] Run focused unit and integration tests.
- [x] Update relevant architecture/release documentation.
- [x] Bump TypeFerry to `0.7.4` without publishing.
- [x] Run lint, typecheck, all tests, build, audit, and package verification.
- [x] Pack the candidate and validate it from VitaFlow.
- [x] Commit, create annotated tag `v0.7.4`, and push commit plus tag.
- [x] Confirm the operator-published `typeferry@0.7.4` artifact and update the
      application template to consume it.
- [x] Reproduce the remaining VitaFlow failure and capture its internal stack
      without weakening sensitive-method telemetry.
- [x] Add a failing unit regression for an ObjectId from another bundle.
- [x] Recognize the stable BSON ObjectId discriminator instead of constructor
      identity.
- [x] Validate a packed `0.7.5` candidate through VitaFlow's full gate.
- [x] Commit, tag `v0.7.5`, and push the corrected release candidate.
- [x] Confirm the operator-published `typeferry@0.7.5` artifact matches the
      verified candidate.

## Direct rollout and verification

The fix ships directly in `0.7.4`; no flag or migration is needed. Acceptance
requires an authenticated real-server snapshot, post-write delta delivery,
connection lifecycle recovery, all TypeFerry gates, package inspection, and a
successful VitaFlow-owned candidate verification. The operator published
`0.7.4` manually, and its registry integrity matches that candidate; the
bundled BSON correction requires the subsequent `0.7.5` release.
