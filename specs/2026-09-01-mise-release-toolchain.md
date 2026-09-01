# Mise-managed npm Release Toolchain Specification

## Problem

The root npm release recipes compare the caller's active `node` and `npm` versions with the required versions, but they do not select those versions. An authenticated publication attempt can therefore pass the registry checks and fail later because the invoking shell has a different toolchain active.

## Evidence

- `justfile` invokes `node` and `npm` directly.
- The TypeScript package requires Node.js `24.19.0` and npm `11.17.0`.
- The repository has no root Mise configuration for the release workflow.
- Mise can manage both required tools through its Node and npm backends.

## Desired Outcome

Make the npm verification and publication recipes automatically install and select the exact release toolchain through Mise, independent of the caller's active Node.js and npm versions.

## Scope and Contracts

- Add a root Mise configuration pinning Node.js `24.19.0` and npm `11.17.0`.
- Add one shared release prerequisite that runs `mise install`.
- Run every release-related Node.js and npm command through `mise exec`.
- Preserve all existing branch, worktree, authentication, version-availability, quality, artifact, and explicit-publication safeguards.
- Do not publish while implementing or verifying this change.
- Update the operator documentation and release-verification runbook.

## Test Strategy

Extend the existing publication contract test before implementation. It must require the root Mise pins, automatic installation prerequisite, dependency wiring for both release paths, and Mise-wrapped Node/npm invocations. Run that focused test first, then validate Just syntax and execute the complete non-publishing release gate.

## Risks and Recovery

- Mise installation can require network access when a pinned tool is absent. The command should fail before npm verification or publication if installation fails.
- A separately managed npm executable must still run with the pinned Node.js runtime. `mise exec` supplies both tools in one environment.
- Recovery is a normal revert of the root Mise configuration, recipe wiring, tests, documentation, specification, and decision record.

## Acceptance Criteria

- [x] Root Mise configuration pins Node.js `24.19.0` and npm `11.17.0`.
- [x] Both npm release commands automatically install the pinned tools.
- [x] All release-related Node/npm invocations use the pinned Mise environment.
- [x] Existing publication safeguards remain unchanged.
- [x] The focused contract test and complete non-publishing release gate pass.
- [x] Release documentation describes the automatic toolchain selection.
- [x] A decision record captures the workflow choice and consequences.

## Executable Checklist

1. Add a failing publication contract test for the Mise-managed toolchain.
2. Add the root Mise pins and shared installation prerequisite.
3. Wrap every release Node/npm invocation with `mise exec`.
4. Update release documentation and the runbook.
5. Run the focused contract test, Just syntax check, and non-publishing release gate.
6. Record the workflow decision, update acceptance results, and commit all task-owned files.

## Direct Rollout

After this change is merged, an authenticated maintainer runs `just publish-npm` as before. The recipe installs and selects its toolchain before checking registry state; publication remains the only irreversible step.
