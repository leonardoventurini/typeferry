# Lossless Homogeneous Variadic Tuple Compilation

## Context

Zod uses a variadic tuple to express arrays with a required prefix. VitaFlow's
patient history uses `z.tuple([Change], Change)` to require one or more
homogeneous changes. Draft-04 emits this as positional `items` plus
`additionalItems`, while MongoDB does not support general positional tuples.

## Decision

TypeFerry recognizes only variadic tuples whose converted required-prefix
schemas are all structurally identical to the converted rest schema. It emits
the rest validator as homogeneous `items` and the required-prefix length as
`minItems`.

Fixed tuples, heterogeneous variadic tuples, missing rest schemas, malformed
nodes, and any prefix/rest mismatch remain unsupported and fail compilation
with the schema path.

## Rejected alternatives

- Rejecting all tuples was rejected because the homogeneous variadic subset has
  an exact MongoDB representation and is used by a canonical consumer contract.
- Treating every tuple as an array was rejected because it would discard
  positional types and required-prefix cardinality.
- Duplicating or weakening the VitaFlow persistence schema was rejected because
  it would create a second contract merely to accommodate the compiler.

## Consequences

- Non-empty and other homogeneous variadic Zod tuples retain their exact
  element and minimum-cardinality enforcement in MongoDB.
- MongoDB code 121 rejects empty arrays when a prefix is required and rejects
  elements outside the homogeneous schema.
- Future tuple support must remain demonstrably lossless or require a separate
  decision.
