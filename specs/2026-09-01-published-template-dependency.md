# Published Template Dependency Specification

## Problem

The TypeScript package is now published to npm as `typeferry@0.6.0`, but its
exact Node.js `24.19.0` consumer engine prevents the Node.js `26.5.1`
application template from installing it. The template still resolves the
package through `file:../typeferry-ts`, and current documentation describes
publication as pending or presents the local file dependency as the workflow.

## Evidence

- `npm view typeferry version dist-tags --json` reported `0.6.0` as `latest` on
  2026-09-01.
- `template/package.json` and `template/package-lock.json` resolve `typeferry`
  from `file:../typeferry-ts`.
- `scripts/test_typeferry_rebrand.py` requires that local dependency contract.
- A registry install under the template's pinned toolchain fails with
  `EBADENGINE` because `typeferry@0.6.0` requires Node.js `24.19.0` exactly.
- `README.md`, `docs/README.md`, `docs/getting-started.md`, and
  `docs/typescript/deployment.md` contain pre-publication or local-file guidance.

## Desired Outcome

Publish `typeferry@0.6.1` with consumer support for Node.js versions from
`24.19.0` through the Node.js 26 line, then make that release the only default
TypeFerry dependency for the template and all current-facing documentation.

## Scope, Assumptions, and Contracts

- Change the public package's `engines.node` contract to `>=24.19.0 <27` while
  retaining exact Node.js `24.19.0` for development, CI, and publication.
- Release the compatibility correction as patch version `0.6.1`; do not change
  runtime APIs, exports, wire behavior, or production dependencies.
- Verify, commit, and publish the package through the existing guarded
  `just publish-npm` workflow before migrating the template.
- Change the template's existing production dependency source from the local
  repository path to npm range `^0.6.1` and regenerate its lockfile with npm.
- Update the repository contract test before changing the manifest so it
  requires the published dependency range.
- Remove all current-facing claims that npm publication is pending or that the
  template resolves the local TypeScript source tree.
- Preserve historical specifications and decisions as historical evidence.
- Do not change the publication status of the Python and Rust implementations.
- Do not retain an alternate documented `file:` workflow.

## Test Strategy and Acceptance Criteria

1. Package contract tests require version `0.6.1`, consumer Node.js range
   `>=24.19.0 <27`, and the exact development/release toolchain.
2. The complete npm release gate passes and the registry reports `0.6.1` as
   published with the intended engine metadata.
3. The repository contract test requires `typeferry` dependency `^0.6.1`.
4. The template manifest and lockfile resolve registry package `typeferry@0.6.1`
   with npm integrity metadata and no local link entry.
5. A current-surface scan finds no pending-publication or local-file guidance
   outside historical records.
6. Template format checking, linting, strict type checking, unit, integration,
   and browser tests, client and server builds, and npm audit pass.
7. Repository contract tests and `git diff --check` pass.

## Risks and Recovery

- Registry installation introduces network availability into fresh template
  installs. The lockfile pins the exact artifact and integrity digest.
- A published artifact could differ from the local source checkout. Running the
  complete template verification surface against the registry artifact catches
  packaging or export defects.
- npm publication is effectively irreversible. If `0.6.1` is incorrect,
  deprecate it and publish a higher patch; never reuse the version.
- Repository changes after publication remain recoverable through a normal
  revert, but reverting package metadata does not remove the registry artifact.

## Executable Checklist

- [x] Commit this specification and the test contract that rejects the old
  dependency source.
- [x] Update package tests, version, engine metadata, release validation, and
  release documentation for `0.6.1`.
- [x] Run the complete npm release gate, commit the release, and publish it.
- [x] Install `typeferry@^0.6.1` in `template/` with its pinned Mise toolchain.
- [x] Update every current-facing documentation reference.
- [x] Run focused repository and dependency-resolution checks.
- [x] Run the complete template verification surface and npm audit.
- [x] Add a decision record for the template dependency-source policy.
- [x] Commit the verified implementation with semantic, path-limited staging.

## Verification Results

- npm registry metadata confirmed `typeferry@0.6.1`, consumer Node.js range
  `>=24.19.0 <27`, and the expected published integrity digest.
- Repository rebrand and publication dependency contracts passed, and a
  current-facing scan found no remaining pending-publication or local-file
  guidance.
- On the template's pinned Node.js `26.5.1`, formatting, lint, strict typecheck,
  11 unit tests, 2 integration tests, 1 browser test, client/server builds, and
  `npm audit --audit-level=low` passed.
- npm reported zero vulnerabilities. Installation warned that three transitive
  optional `fsevents` versions have unapproved install scripts; the packages are
  macOS filesystem-watcher variants and no script approval was added.

## Direct Rollout

Publish the clean, verified release commit through `just publish-npm`. After the
registry confirms `0.6.1`, commit the template and documentation migration. New
template checkouts then install the published package through `npm ci`.
