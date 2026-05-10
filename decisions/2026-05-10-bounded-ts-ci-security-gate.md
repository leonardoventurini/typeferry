# Bounded TypeScript CI Security Gate

Date: 2026-05-10
Status: Accepted

## Context

Forgejo TypeScript CI runs were being cancelled after the platform-level timeout,
which made dependency security scanner failures look like stuck jobs. Local
reproduction showed `bun install --frozen-lockfile` was blocked by Bun's OSV
scanner because the lockfile still resolved vulnerable Hono, PostCSS, and
`ip-address` versions.

## Decision

Keep Bun's install-time OSV scanner enforced and remediate dependency findings
instead of bypassing the scanner. Bound the TypeScript CI job and long install
or test steps with explicit timeouts so future dependency, browser, or runner
regressions fail near the responsible step.

## Consequences

- CI remains security-gated by `bun install --frozen-lockfile`.
- Vulnerable transitive packages are resolved through package updates and the
  Vite override, not warning suppression.
- Future hangs should stop within the job or step timeout instead of consuming
  Forgejo's full run timeout.
