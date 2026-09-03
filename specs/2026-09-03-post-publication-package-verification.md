# Post-publication npm package verification

Status: accepted

## Problem and evidence

The TypeScript CI package gate invokes `npm publish --dry-run --json`. After
`typeferry@0.8.0` was published, npm began rejecting that command because a
published version cannot be reused. Consequently every push fails in the
`Verify npm package` step even when the artifact is valid.

Run `33724129193` demonstrates the failure. The preceding lint, typecheck,
test, and build steps passed; npm rejected only the dry-run publication of the
existing version.

## Desired outcome

CI validates the exact package file set before and after publication without
attempting a registry publication. The operator-controlled publish path must
continue checking that a candidate version is absent before the real upload.

## Contracts

- Artifact verification uses `npm pack --dry-run --json` and retains every
  manifest, allowlist, source/output, export, declaration, and source-map check.
- `assert-npm-publish-state` retains the explicit registry availability check.
- `publish-npm` retains the real `npm publish --access public` operation after
  the full release gate.
- CI remains non-publishing and requires no npm credentials.
- Documentation distinguishes repeatable artifact verification from the
  one-time version-availability and publication steps.

## Risks and recovery

The npm pack report could differ structurally from the publish dry-run report.
Use the existing parser shape, cover the command contract in repository tests,
and execute the validator locally against the built package. Revert this unit
to recover; it changes no package artifact or registry state.

## Direct rollout

Push the fix to `main`; the normal CI trigger verifies the post-publication
path. No package release is required.

## Verification

- [ ] Update and run the repository publication-contract test first.
- [ ] Run the package verifier successfully for published `0.8.0`.
- [ ] Run the relevant CI workflow contract test.
- [ ] Confirm version availability remains in the publish-state gate.
- [ ] Confirm the real publish command remains operator-controlled.
- [ ] Update release documentation and the npm publication decision.
- [ ] Commit the verified fix semantically.
