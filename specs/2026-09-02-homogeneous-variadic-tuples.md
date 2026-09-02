# Homogeneous Variadic Tuple MongoDB Compatibility

## Problem and evidence

VitaFlow models a non-empty patient-history change set as
`z.tuple([ChangeSchema], ChangeSchema)`. Zod emits this as draft-04 tuple
`items` plus `additionalItems`. TypeFerry 0.7.1 rejects every tuple node, even
though this specific homogeneous variadic form has an exact MongoDB
representation as one `items` schema with `minItems` equal to the required
prefix length.

## Desired outcome and contracts

- Compile a variadic tuple only when every required prefix schema and the rest
  schema are structurally identical after BSON conversion.
- Emit one MongoDB `items` validator and `minItems` equal to the prefix length.
- Continue rejecting fixed tuples, heterogeneous variadic tuples, and malformed
  tuple output.
- Prove a real MongoDB collection accepts valid non-empty arrays and rejects
  empty or wrong-element arrays.
- Release the backward-compatible correction as `typeferry@0.7.2` before using
  it in VitaFlow.

## Risks and uncertainty

General tuples have positional semantics MongoDB `$jsonSchema` cannot express
without loss. Recognition must therefore be structural and fail closed. The
compiler must not treat arbitrary `additionalItems` output as a homogeneous
array.

## Recovery and rollout

Before publication, revert the patch normally. After publication, never reuse
0.7.2; deprecate it if necessary and publish a higher patch. Add failing unit
and replica-set tests first, implement the bounded conversion, run the complete
release gate, publish and tag 0.7.2, then install the public artifact in
VitaFlow and resume its full reconciliation tests.

## Executable checklist

- [ ] Add failing homogeneous, fixed, heterogeneous, and malformed tuple tests.
- [ ] Implement lossless homogeneous variadic tuple compilation.
- [ ] Run all release gates and package verification.
- [ ] Publish npm package and push annotated `v0.7.2`.
- [ ] Upgrade and verify VitaFlow.

## Acceptance criteria

- [ ] A one-or-more Zod tuple compiles to homogeneous BSON `items` with
      `minItems: 1`.
- [ ] Unsupported tuple forms still fail closed.
- [ ] MongoDB rejects empty and invalid-element writes with code 121.
- [ ] The npm artifact and Git tag identify the verified patch.
