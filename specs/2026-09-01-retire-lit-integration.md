# Retire the Lit Integration

## Problem

TypeFerry currently maintains two UI-framework adapters even though React is the supported end-user framework direction. The Lit adapter adds a public export, peer and development dependencies, fourteen implementation/test files, package output, and documentation that must evolve alongside the core client.

## Evidence

- `typeferry-ts/package.json` exports `typeferry-ts/lit` and declares Lit as an optional peer and development dependency.
- `typeferry-ts/src/lit/` contains reactive controllers, utilities, and unit tests.
- Root, package, end-user, and architecture documentation advertise Lit alongside React.
- `docs/plans/2026-04-20-direct-call-controller-extension.md` contains broader core/React design work plus proposed Lit-specific tasks.
- The package is private and registry publishing remains disabled, but removing `typeferry-ts/lit` is still a public contract change for repository-local consumers.

## Desired Outcome

Fully remove the Lit integration and retain React as TypeFerry's only UI-framework adapter. Keep the framework-agnostic TypeScript client unchanged. Remove actionable Lit work from the broader direct-call plan while retaining its core and React design.

## Scope and Contracts

- Delete `typeferry-ts/src/lit/`, including its tests.
- Remove the `./lit` package export, Lit peer metadata, Lit development dependency, and lockfile packages that are no longer reachable.
- Remove the current Lit guide and every active end-user or architecture claim that Lit is supported.
- Rewrite Lit-specific sections of the broader direct-call plan to describe a React-only UI adapter direction; do not delete the entire plan.
- Update repository and package agent instructions so future work does not restore a Lit adapter accidentally.
- Preserve the core client, React adapter, protocol, runtime behavior, and other language implementations.
- Provide no compatibility stub or deprecated `typeferry-ts/lit` export. This immediate breaking removal is explicitly approved.

## Test Strategy

No replacement unit tests are needed for deleted behavior. Verification begins with negative structural assertions and then exercises the surviving package:

1. Assert that `src/lit`, the `./lit` export, Lit dependency metadata, current Lit documentation, and build output are absent.
2. Run TypeScript lint and strict typecheck.
3. Run the split unit, integration, and browser suites to protect the core and React adapter.
4. Build declarations/ESM and inspect `npm pack --dry-run` to confirm no `dist/lit` release surface remains.
5. Confirm the lockfile is synchronized with `npm ci` and local Markdown links resolve.

## Acceptance Criteria

- [ ] `typeferry-ts/src/lit/` and its tests no longer exist.
- [ ] `typeferry-ts/lit` is not exported and no compatibility stub exists.
- [ ] Lit is absent from package peer dependencies, development dependencies, peer metadata, and reachable lockfile packages.
- [ ] React is the only documented UI-framework adapter; the core client remains supported independently.
- [ ] Active documentation contains no stale Lit guide or links.
- [ ] The direct-call plan retains core/React material and contains no actionable Lit implementation work.
- [ ] Agent instructions and architecture documentation reflect the React-only adapter direction.
- [ ] Lint, typecheck, split tests, build, package inspection, lockfile integrity, Markdown links, and `git diff --check` pass.
- [ ] A decision record captures the immediate Lit API retirement and consequences.
- [ ] Task-owned changes are committed semantically and the worktree is clean.

## Risks and Recovery

- Repository-local consumers importing `typeferry-ts/lit` will fail immediately. This is intended and has no compatibility layer.
- Removing Lit from the lockfile could affect unrelated transitive packages if edited manually, so npm must perform the dependency removal.
- Historical planning context could be damaged by broad rewriting. Limit plan edits to Lit-specific responsibilities and routing language.
- Recovery is a revert of the implementation commit, followed by `npm ci` to restore the prior dependency graph.

## Executable Checklist

1. Commit this specification.
2. Remove Lit source, tests, export metadata, and dependencies.
3. Update active docs, agent instructions, and the direct-call plan.
4. Add the architectural decision record.
5. Run structural, package, test, build, pack, and documentation verification.
6. Mark acceptance criteria, commit the retirement, and report executed versus inferred checks.

## Direct Rollout

Merge directly. No registry release or deployed data migration exists. Repository-local consumers must remove `typeferry-ts/lit` imports in the same integration window.
