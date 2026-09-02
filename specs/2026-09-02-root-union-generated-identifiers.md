# Root Union Generated Identifier Compatibility

## Problem and evidence

TypeFerry permits MongoDB's generated `_id` on a strict root object, but not on
strict object alternatives beneath a root `anyOf`, `oneOf`, or `allOf`.
A downstream persistence schema exposed the strict root-union case, where
MongoDB would reject valid inserts after the driver adds `_id`.

## Desired outcome and contracts

- Add the generated ObjectId property to every root combinator branch that is a
  strict object and does not already declare `_id`.
- Traverse only root combinators; never inject `_id` into nested property
  objects or overwrite an explicit identifier contract.
- Preserve all strict branch properties, required fields, and unsupported-node
  failures.
- Prove create and existing-collection reconciliation with real MongoDB writes.
- Release the correction as `typeferry@0.7.3` after downstream validation.

## Risks and recovery

Over-broad recursion could permit `_id` in nested domain objects. Tests must
assert the allowance appears only in root alternatives. Before publication,
revert normally. After publication, never reuse 0.7.3; publish a higher patch if
necessary.

## Rollout and verification

Add failing unit and replica-set tests, implement bounded root-combinator
recursion, run the complete release gate and downstream validation, then
publish and tag 0.7.3.

## Executable checklist

- [x] Add failing root-union and nested-object regression tests.
- [x] Implement bounded root-combinator identifier allowance.
- [ ] Run all release gates and package verification.
- [ ] Publish npm package and push annotated `v0.7.3`.
- [ ] Complete downstream candidate validation.

## Acceptance criteria

- [x] Generated ObjectIds pass every strict root object alternative.
- [x] Nested strict objects remain closed to `_id`.
- [x] Explicit root identifiers remain unchanged.
- [ ] The npm artifact and Git tag identify the verified patch.
