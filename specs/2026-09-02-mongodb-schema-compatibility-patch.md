# MongoDB Schema Compatibility Patch

## Problem and evidence

VitaFlow's first full reconciliation against published `typeferry@0.7.0`
exposed two compiler incompatibilities: JSON Schema `boolean` must become
MongoDB BSON `bool`, and Zod's output-only `readOnly` annotation is rejected as
an unknown validator keyword. MongoDB rejects the former and does not implement
the latter as a validation keyword.

## Desired outcome and contracts

- Map JSON Schema `boolean` to BSON `bool` everywhere, including unions.
- Discard `readOnly` as a non-enforcing annotation while preserving the field's
  structural validator.
- Preserve fail-closed behavior for every other unsupported keyword.
- Add unit coverage and a real MongoDB valid/invalid boolean write assertion.
- Release the backward-compatible correction as `typeferry@0.7.1`.

## Uncertainty and risks

The patch must not broaden unrelated schemas or turn unknown annotations into a
general ignore list. The published `0.7.0` artifact is immutable; it may remain
available, while consumers requiring schema reconciliation move to `0.7.1`.

## Recovery

Before publication, revert or correct the patch normally. After publication,
deprecate a faulty version and publish a higher patch; never reuse `0.7.1`.

## Direct rollout

Implement tests and the two bounded conversions, run the complete release gate,
push the release commit, publish manually, verify npm, tag `v0.7.1`, then upgrade
VitaFlow and resume reconciliation.

## Executable checklist and verification

- [x] Add failing boolean/readOnly unit and integration tests.
- [x] Implement the bounded compiler correction.
- [x] Run lint, strict types, all tests, build, audit, and package verification.
- [x] Prepare and push `0.7.1`.
- [x] Verify npm publication and push annotated `v0.7.1`.
- [ ] Upgrade and verify VitaFlow.

## Acceptance criteria

- [x] Zod booleans enforce MongoDB BSON booleans.
- [x] Readonly Zod fields retain their structural validation.
- [x] Unsupported keywords still fail closed.
- [x] `typeferry@0.7.1` and its Git tag identify the verified patch.
