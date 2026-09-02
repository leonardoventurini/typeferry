# Published Template Dependency Specification

## Problem

The TypeScript package is now published to npm as `typeferry@0.6.0`, but the
application template still resolves it through `file:../typeferry-ts`. Current
documentation also describes publication as pending and presents the local
file dependency as the repository-development workflow.

## Evidence

- `npm view typeferry version dist-tags --json` reported `0.6.0` as `latest` on
  2026-09-01.
- `template/package.json` and `template/package-lock.json` resolve `typeferry`
  from `file:../typeferry-ts`.
- `scripts/test_typeferry_rebrand.py` requires that local dependency contract.
- `README.md`, `docs/README.md`, `docs/getting-started.md`, and
  `docs/typescript/deployment.md` contain pre-publication or local-file guidance.

## Desired Outcome

Make the published npm package the only default TypeFerry dependency for the
application template and all current-facing documentation, using the compatible
range `^0.6.0`.

## Scope, Assumptions, and Contracts

- Change the template's existing production dependency source from the local
  repository path to npm range `^0.6.0` and regenerate its lockfile with npm.
- Update the repository contract test before changing the manifest so it
  requires the published dependency range.
- Remove all current-facing claims that npm publication is pending or that the
  template resolves the local TypeScript source tree.
- Preserve historical specifications and decisions as historical evidence.
- Do not change TypeFerry APIs, protocol behavior, package exports, or the
  publication status of the Python and Rust implementations.
- Do not retain an alternate documented `file:` workflow.

## Test Strategy and Acceptance Criteria

1. The repository contract test requires `typeferry` dependency `^0.6.0`.
2. The template manifest and lockfile resolve registry package `typeferry@0.6.0`
   with npm integrity metadata and no local link entry.
3. A current-surface scan finds no pending-publication or local-file guidance
   outside historical records.
4. Template format checking, linting, strict type checking, unit, integration,
   and browser tests, client and server builds, and npm audit pass.
5. Repository contract tests and `git diff --check` pass.

## Risks and Recovery

- Registry installation introduces network availability into fresh template
  installs. The lockfile pins the exact artifact and integrity digest.
- A published artifact could differ from the local source checkout. Running the
  complete template verification surface against the registry artifact catches
  packaging or export defects.
- Recovery is a normal revert of the manifest, lockfile, tests, and guidance.
  Existing npm publication is not changed by this task.

## Executable Checklist

- [ ] Commit this specification and the test contract that rejects the old
  dependency source.
- [ ] Install `typeferry@^0.6.0` in `template/` with its pinned Mise toolchain.
- [ ] Update every current-facing documentation reference.
- [ ] Run focused repository and dependency-resolution checks.
- [ ] Run the complete template verification surface and npm audit.
- [ ] Add a decision record for the template dependency-source policy.
- [ ] Commit the verified implementation with semantic, path-limited staging.

## Direct Rollout

Merge the committed change. New template checkouts then install the published
package through `npm ci`; no migration or external mutation is required.
