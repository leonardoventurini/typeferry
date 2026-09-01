# GitHub Actions CI Migration Specification

## Problem

TypeFerry now lives on GitHub, but its only continuous-integration workflow remains under `.forgejo/workflows` and uses Forgejo-specific action URLs, context variables, and an ARM64 runner label. GitHub therefore does not run the existing TypeScript verification contract.

## Evidence

- `.forgejo/workflows/ci.yml` is the sole remaining Forgejo workflow.
- The workflow verifies `typeferry-ts` with exact Node.js `24.19.0` and npm `11.17.0`.
- Integration coverage requires Docker-hosted MongoDB 7 replica-set and Redis 7.4 services.
- Browser coverage requires Playwright system dependencies and browser binaries.
- Publishing is disabled and is outside this migration.

## Desired Outcome

Replace the Forgejo workflow with an equivalent GitHub Actions workflow at `.github/workflows/ci.yml`, running on GitHub-hosted `ubuntu-24.04`. Preserve triggers, cancellation behavior, toolchain pinning, security audit, lint, typecheck, split tests, integration services, browser setup, build, and dry-run package inspection.

## Scope and Assumptions

- Migrate the existing TypeScript CI contract one-for-one.
- Do not add Python or Rust CI jobs.
- Do not restore publishing or release automation.
- Use official GitHub-maintained actions and GitHub context variables.
- Grant only read access to repository contents.

## Contracts

- Pushes to `main` and pull requests run CI when TypeScript, shared conformance, protocol, or workflow files change.
- Concurrency is keyed by `github.ref`, with stale runs cancelled.
- The job runs on `ubuntu-24.04` with a 35-minute timeout.
- Node.js, npm, Redis, MongoDB, and Playwright versions and verification stages remain unchanged.
- Integration containers are stopped even after failed tests.
- `.forgejo/workflows/ci.yml` is removed and documentation points to `.github/workflows/ci.yml`.

## Risks and Recovery

- GitHub-hosted Docker networking may differ from the former runner; retain explicit loopback ports and readiness checks.
- Browser dependency installation may differ on x64 Ubuntu; preserve Playwright's supported installation commands.
- Restore the prior commit to recover the Forgejo workflow if the GitHub run exposes an incompatibility.

## Test Strategy and Acceptance Criteria

- [x] Add a repository-level contract test that rejects Forgejo workflow/context/action references and asserts the GitHub runner, triggers, permissions, and required CI stages.
- [x] Create `.github/workflows/ci.yml` and remove `.forgejo/workflows/ci.yml`.
- [x] Parse the resulting YAML successfully.
- [x] Run the workflow contract test.
- [x] Run the existing textual release/rebrand helper tests affected by repository-path assertions.
- [x] Confirm no tracked Forgejo workflow or Forgejo-specific CI reference remains.
- [ ] Confirm `git diff --check` passes and the working tree is clean after a semantic commit.
- [ ] Push the migration to `origin/main` and verify the remote branch contains the commit.

## Direct Rollout

Push the committed workflow directly to `main`. GitHub Actions will become the active CI system immediately; no registry credentials or release permissions are introduced.

## Verification Reporting

Report locally executed contract/YAML checks separately from the first hosted GitHub Actions run. Disclose any hosted-run result that cannot be observed during the push.
