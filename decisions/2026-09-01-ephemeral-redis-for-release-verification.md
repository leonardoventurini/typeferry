# Ephemeral Redis for Release Verification

## Context

The TypeScript integration suite needs Redis. The npm release gate previously relied on an externally started service at the conventional local port, so a clean release-verification run could fail with a connection refusal or conflict with an operator-managed Redis instance. The test runtime already accepts `REDIS_URL`.

## Decision

The repository-level npm release gate runs its test phase through `scripts/run-with-redis.sh`.

- A non-empty caller-provided `REDIS_URL` remains authoritative and bypasses Docker.
- Without that variable, the helper starts `redis:7-alpine` in a disposable Docker container.
- Docker publishes container port 6379 to a dynamically allocated port bound only to `127.0.0.1`.
- The helper waits for `redis-cli ping` before executing tests, exports the resolved URL only to its child process, preserves the child's exit status, and stops the container through an exit trap.
- The container is labeled `typeferry.purpose=release-verification` so an exceptional leftover can be identified safely.

This is release infrastructure behavior, not a change to TypeFerry's runtime Redis defaults or wire contract.

## Rejected Alternatives

- Always use port 6379: rejected because it conflicts with existing services and does not isolate the release gate.
- Always create a container even when `REDIS_URL` is set: rejected because CI and operators may intentionally provide a managed Redis service.
- Reject external Redis URLs: rejected because that removes an existing supported deployment and verification path.
- Add separate external and containerized release recipes: rejected because one environment-sensitive recipe preserves the existing operator command without duplicating the release gate.
- Add a production dependency that embeds Redis: rejected because lifecycle orchestration belongs to release tooling, not the published runtime.

## Rationale

Dynamic loopback publication removes the default-port collision while keeping Redis inaccessible from non-local interfaces. Preserving `REDIS_URL` supports managed environments. A small command wrapper makes lifecycle behavior executable and independently testable, while keeping the Just recipe focused on release sequencing.

## Consequences

- `just verify-npm-release` and `just publish-npm` require a working Docker daemon only when `REDIS_URL` is absent.
- The first fallback run may pull the Redis image and take longer.
- The helper owns only containers it creates and does not inspect, reuse, or stop unrelated Redis instances.
- Docker startup, mapping, or readiness failures stop release verification before npm tests.
- An uncatchable process termination can bypass shell cleanup; the task-specific Docker label provides a narrow recovery target for manual inspection and removal.
