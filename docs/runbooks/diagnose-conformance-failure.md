# Diagnose a Conformance Failure

Use this runbook when an implementation disagrees with a shared fixture or another language server.

## Preconditions

- Record the failing language, runner, fixture path, and observed output.
- Read the matching section of [`PROTOCOL.md`](../../PROTOCOL.md) and the fixture format in [`docs/conformance/README.md`](../conformance/README.md).
- Treat the protocol and valid fixture as the oracle; do not assume the oldest implementation is correct.

## Procedure

1. Reproduce only the failing fixture or smallest test module.
2. Classify the mismatch as fixture loading, serialization, transport framing, runtime dispatch, auth, event routing, or test harness lifecycle.
3. Compare the decoded semantic value before comparing raw bytes. For canonical EJSON or cache keys, compare the required canonical bytes as well.
4. Run the same fixture through one known-good implementation.
5. Inspect the implementation boundary responsible for the mismatch; avoid patching the harness unless its interpretation contradicts the protocol.
6. Add a focused regression assertion before fixing the implementation.
7. Re-run the single case, its fixture family, the package suite, and cross-language tests in that order.

## Useful commands

TypeScript commands run from `typeferry-ts/`:

```sh
npm run test:unit -- src/test/conformance/ejson-fixtures.unit.spec.ts
npm run test:integration -- src/test/conformance/http-fixtures.integration.spec.ts
npm run test:integration -- src/test/conformance/ws-fixtures.integration.spec.ts
```

Python commands run from `typeferry-py/`:

```sh
python -m pytest tests/conformance -x -vv
```

Rust commands run from `typeferry-rs/`:

```sh
cargo test -p typeferry-conformance -- --nocapture
```

Use the runner's test-name or parameter filter after the command to isolate one case when necessary.

## Acceptance criteria

- The failure is explained at a named contract boundary.
- A focused test fails before the fix and passes afterward.
- The complete fixture family passes.
- Cross-language checks pass or an environmental limitation is disclosed.
- The fix does not weaken validation or silently normalize invalid input.

## Recovery

If the fixture is wrong, correct the fixture and `PROTOCOL.md` together, then verify every consumer. If the protocol is ambiguous, stop implementation, resolve the contract explicitly, and record the decision before changing behavior.
