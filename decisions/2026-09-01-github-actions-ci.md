# GitHub Actions for TypeScript CI

## Context

TypeFerry moved from its preserved legacy Forgejo repository to GitHub. The repository's sole CI workflow still used Forgejo-specific action URLs, context variables, paths, and an ARM64 runner label, so GitHub could not execute it.

## Decision

Run the existing TypeScript CI contract in GitHub Actions:

- store the workflow at `.github/workflows/ci.yml`;
- use GitHub-hosted `ubuntu-24.04`;
- use the Node.js 24-based `actions/checkout@v6`, `actions/setup-node@v7`, and `actions/cache@v5`;
- key concurrency with `github.ref` and cancel stale runs;
- grant the workflow read-only repository contents permission;
- preserve exact Node.js and npm versions, audit, lint, typecheck, split tests, Docker-backed MongoDB and Redis integration services, Playwright setup, build, and dry-run package inspection;
- keep publication and release automation disabled.

## Rejected Alternatives

- A self-hosted ARM64 runner was rejected because the GitHub-hosted x64 runner was selected.
- An x64/ARM64 matrix was rejected because it would expand cost and scope beyond migration parity.
- Adding Python and Rust jobs was rejected because this change migrates the existing workflow rather than redesigning CI coverage.
- GitHub Actions service containers were not adopted because the existing explicit Docker lifecycle includes MongoDB replica-set initialization and reliable cleanup semantics.

## Rationale

The one-for-one migration restores the already-established verification contract with minimal operational change. An explicit Ubuntu version avoids drift from `ubuntu-latest`, while official GitHub actions and least-privilege permissions make the platform boundary clear.

## Consequences

- GitHub-hosted x64 Linux becomes the authoritative CI environment for `typeferry-ts`.
- Changes limited to Python or Rust do not trigger CI until a separately approved coverage expansion.
- Docker Hub availability remains an external dependency for MongoDB and Redis integration tests.
- The first hosted run is the final validation of Docker networking and Playwright system dependency behavior on GitHub's runner image.
