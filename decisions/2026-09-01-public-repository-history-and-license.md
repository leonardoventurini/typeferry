# Public Repository History and License

## Context

The pre-publication audit found no usable credentials, but reachable history contained an internal package-registry endpoint, internal organization identifiers, absolute workstation paths, and an internal-domain release-bot identity. The current package metadata also lacked an open-source license.

Publishing only a sanitized tip would leave the internal metadata available through ordinary Git history. Starting a new root would remove the project's development record and make existing review references harder to follow.

## Decision

- License TypeFerry under the MIT License, copyrighted in 2026 by Leonardo Venturini.
- Rewrite every locally reachable revision to remove the internal registry configuration and replace internal application and workstation identifiers with generic examples.
- Attribute the four commits formerly owned by the internal release bot to `Leonardo Venturini <leovenbag@gmail.com>` for both author and committer identity.
- Preserve Leonardo Venturini's existing personal commit identity everywhere else.
- Retain intentionally fake test tokens and the standard WebSocket example nonce because they are executable fixtures, not credentials.
- Keep the rewritten repository remote configured, but do not force-push as part of the remediation task.

## Rejected Alternatives

- **Sanitize only the current tree:** rejected because internal metadata would remain publicly accessible in history.
- **Create a new root commit:** rejected because it would discard useful development and review history.
- **Preserve the internal bot identity:** rejected because its domain discloses the internal organization.
- **Replace the personal email:** rejected because the repository owner explicitly chose to retain it.
- **Use Apache-2.0, dual MIT/Apache-2.0, MPL-2.0, or proprietary terms:** rejected in favor of the explicitly selected MIT License.

## Rationale

The rewrite retains the useful project graph while removing publication-sensitive metadata from every reachable revision. MIT provides a short, widely understood permissive license. Mapping the former bot commits to the owner's retained identity removes the internal domain without inventing an unsupported public bot account.

## Consequences

- All rewritten descendant commit identifiers differ from their pre-remediation identifiers.
- One commit whose effective content became empty was pruned; the locally reachable graph changed from 135 to 134 commits.
- The eventual publication requires a coordinated force-push with lease protection after verifying the remote has not advanced.
- Existing clones must be replaced with fresh clones or explicitly reset to the rewritten branch; merging old history would reintroduce the removed metadata.
- A verified full-ref bundle created before the rewrite is the rollback source. Its location and SHA-256 digest are recorded in the task handoff rather than in repository history because the path itself identifies the workstation.
- Remote refs not present in this clone were not available to inspect and must not be merged into the sanitized graph without a separate scan.
