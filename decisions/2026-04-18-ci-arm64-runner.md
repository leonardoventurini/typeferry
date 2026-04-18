# CI arm64 runner

## Context

The Forgejo CI workflow still relied on `ubuntu-latest`, which left the runner architecture implicit.

## Decision

Pin the `ci` job in `.forgejo/workflows/ci.yml` to `arm64`.

## Consequences

- The workflow runs on an explicit architecture instead of a moving alias.
- CI now matches the broader ExampleApp runner migration to arm64.
