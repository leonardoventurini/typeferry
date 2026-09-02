# MongoDB BSON Boolean and Readonly Compatibility

## Context

The first production-shaped consumer of TypeFerry's Zod-derived MongoDB
validators exposed two dialect differences: MongoDB names the BSON boolean type
`bool`, and Zod emits `readOnly` as an output annotation even though MongoDB
does not accept it as a validation keyword.

## Decision

Translate JSON Schema `boolean` to BSON `bool`. Discard only the `readOnly`
annotation while continuing to compile and enforce the annotated field's
structural schema. Keep every other unknown keyword fail-closed.

Release the correction as `typeferry@0.7.1`; do not alter or replace the
immutable `0.7.0` artifact.

## Rationale

Both conversions preserve the intended validation contract. `bool` is
MongoDB's exact BSON spelling. `readOnly` describes API mutation semantics and
does not constrain stored values, so removing that annotation does not broaden
the field's BSON shape.

## Rejected alternatives

- Copying or weakening VitaFlow schemas was rejected because it would create a
  second persistence authority.
- Ignoring every unknown JSON Schema keyword was rejected because it would
  undermine fail-closed compilation.
- Reusing `0.7.0` was rejected because npm versions are immutable.

## Consequences

- Readonly Zod objects and fields can participate in MongoDB reconciliation.
- Boolean validation works on MongoDB collection creation and `collMod`.
- Consumers using schema reconciliation should require `typeferry@^0.7.1`.
