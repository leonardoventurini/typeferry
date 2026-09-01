# Publication Safety Remediation Specification

## Problem

TypeFerry is intended to become public. A repository audit found no usable credentials, but the current tree and reachable Git history disclose an internal package registry, internal organization identifiers, absolute workstation paths, and an internal bot email address. The repository also declares `UNLICENSED`, so recipients have no open-source permission to use or redistribute it.

## Evidence

- `template/.npmrc` names an internal scoped registry and package owner.
- Plans, specifications, decisions, and examples contain internal organization names or absolute workstation paths.
- Four reachable commits use an internal-domain release-bot identity.
- TypeScript, Python, and Rust package metadata declares `UNLICENSED`.
- A checksum-verified Gitleaks 8.30.1 scan found only the documented WebSocket example nonce, which is a false positive rather than a credential.

## Desired Outcome

Make the complete reachable repository safe and intentional to publish: remove the identified internal metadata from every revision, attribute the four bot-authored commits to Leonardo Venturini using the retained personal email, license the project under MIT, and verify the rewritten graph for credentials and publication-sensitive identifiers.

## Scope and Assumptions

- Rewrite all locally reachable history, including local and remote-tracking refs.
- Preserve Leonardo Venturini's existing personal commit identity.
- Replace the internal-domain bot identity with Leonardo Venturini's identity.
- Remove obsolete internal registry configuration rather than inventing a public registry scope.
- Replace generic example identifiers with `typeferry`; remove or generalize private filesystem and application-repository references.
- Do not push or force-update the remote during this task.
- Do not alter public runtime APIs, protocol contracts, persisted data formats, dependencies, or security boundaries.

## Contracts

- `LICENSE` contains the MIT License and package metadata identifies MIT consistently.
- No reachable blob contains the internal domain, internal organization identifier, or the identified absolute workstation path.
- No reachable commit identity uses the internal-domain bot email.
- Test fixtures retain intentionally fake tokens and standard protocol nonces where required for coverage.
- Existing application behavior is unchanged.

## Uncertainty

- Automated scanners cannot prove that an arbitrary undocumented string was never used as a credential.
- Rewriting history changes every descendant commit identifier and requires collaborators to re-clone or carefully reset after the eventual force-push.
- Remote refs not present in this clone cannot be inspected or rewritten locally.

## Risks and Recovery

- A broad replacement could alter meaningful examples or documentation. Review every current-tree match before rewriting and run targeted textual checks afterward.
- A history rewrite could omit a ref or damage topology. Create a local Git bundle backup outside the repository before rewriting, verify object connectivity afterward, and retain the bundle until the public migration is accepted.
- Recover by cloning the backup bundle or restoring refs from it. Do not delete the backup as part of this task.

## Test Strategy and Acceptance Criteria

- [ ] Capture the reachable refs, commit count, and author identities before rewriting.
- [ ] Create and verify a restorable bundle containing every reachable ref.
- [ ] Add the MIT License and update TypeScript, Python, and Rust license metadata.
- [ ] Remove internal registry configuration from the template.
- [ ] Sanitize current-tree internal organization and absolute-path references.
- [ ] Run relevant textual tests and metadata parsing checks before rewriting history.
- [ ] Rewrite every reachable revision and the four internal bot identities.
- [ ] Confirm `git fsck --full` succeeds and intended refs remain reachable.
- [ ] Confirm forbidden metadata has zero matches across every reachable blob and commit identity.
- [ ] Re-run checksum-verified Gitleaks against the rewritten history and classify every alert.
- [ ] Confirm the standard WebSocket nonce is the only accepted scanner false positive, if still reported.
- [ ] Confirm the worktree is clean after semantic commits.

## Executable Checklist

1. Commit this specification.
2. Create a full-ref bundle backup and verify it.
3. Add MIT licensing and sanitize the current tree; run focused tests and commit the unit.
4. Rewrite content and identities across all reachable refs with verified history-rewrite tooling.
5. Verify topology, metadata, sensitive patterns, and credentials.
6. Record the irreversible publication decision and recovery procedure; commit it.
7. Repeat final graph and worktree checks, then report the exact force-push and collaborator recovery implications without pushing.

## Direct Rollout

The local rewrite is prepared and verified first. Publishing requires a later coordinated force-push of the rewritten `main` branch, followed by fresh clones for collaborators. The remote is unchanged by this specification.

## Verification Reporting

Report each executed acceptance check separately from inferred conclusions. Include the backup location, rewritten ref and commit counts, scanner version, classified false positives, uninspected remote-ref limitation, rollback procedure, and recommended review order.
