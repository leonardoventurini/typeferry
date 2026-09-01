# Temporary Redis Release Verification Specification

## Problem

`just verify-npm-release` runs the complete TypeScript integration suite, but it assumes a Redis service is already listening at `redis://localhost:6379`. Release verification therefore fails on otherwise clean workstations, and the default port can conflict with an operator-managed Redis instance.

## Evidence

- `typeferry-ts/src/test/redis-test-utility.ts` already reads `REDIS_URL` and otherwise defaults to `redis://localhost:6379`.
- `justfile` invokes `npm test` without provisioning Redis or setting `REDIS_URL`.
- `RELEASING.md` and `docs/runbooks/release-verification.md` require the operator to start Redis manually.
- The observed release gate failed with `ECONNREFUSED 127.0.0.1:6379` and a subsequent Vitest hook timeout.

## Desired Outcome

Make `just verify-npm-release` self-contained when Docker is available: preserve a caller-provided `REDIS_URL`, or otherwise start an ephemeral Redis container on a dynamically assigned loopback port, wait until it is ready, expose its URL to the test process, and remove it on every exit path.

## Scope and Contracts

- Add one repository helper that runs an arbitrary command with Redis available.
- Treat a non-empty caller-provided `REDIS_URL` as authoritative and do not invoke Docker in that branch.
- Otherwise use Docker to bind Redis to a dynamically allocated host port on `127.0.0.1`.
- Poll Redis readiness with a finite timeout before running the child command.
- Stop the task-owned container after child success, child failure, or an interrupt handled by the shell.
- Preserve the child command's exit status.
- Change only release verification infrastructure and documentation. Do not change the wire protocol, TypeScript public API, dependencies, or the general Redis runtime default.

## Test Strategy

Extend `scripts/test_npm_publication.py` before implementation. Use a fake `docker` executable so tests can verify lifecycle calls without requiring Docker:

1. With `REDIS_URL` set, assert the child receives the exact value and Docker is never called.
2. Without `REDIS_URL`, assert the helper starts Redis with a random loopback port, polls readiness, passes the resolved URL to the child, stops the container after a failing child, and returns the child's status.
3. Assert the Just release gate routes `npm test` through the helper while retaining the other release checks.
4. Run recipe syntax checks, focused Python tests, shell syntax validation, and the full release gate when Docker and its daemon are available.

## Acceptance Criteria

- [x] A supplied `REDIS_URL` bypasses Docker unchanged.
- [x] The fallback container publishes Redis only on a random loopback host port.
- [x] Tests start only after Redis reports readiness.
- [x] The fallback container is removed after success, failure, and handled interruption.
- [x] A child failure remains a release-gate failure with the same exit status.
- [x] Docker startup, port discovery, and readiness failures produce actionable errors.
- [x] `just verify-npm-release` uses the helper for the npm test phase.
- [x] Release documentation describes automatic fallback and the Docker prerequisite.
- [x] Focused tests, relevant static checks, and feasible end-to-end verification pass.
- [x] Task-owned changes are committed with a semantic message.

## Risks and Recovery

- Docker may be unavailable or its daemon stopped. The helper must fail clearly; operators can instead provide a reachable `REDIS_URL`.
- An interrupted process may prevent a normal trap from completing under uncatchable termination. Docker's `--rm` removes the container when it is stopped, and any exceptional leftover is identifiable through the helper's container label.
- Dynamic port discovery can vary by Docker output format. Bind explicitly to IPv4 loopback and parse Docker's reported mapping defensively.
- Recovery is a normal revert of the helper, recipe wiring, tests, and documentation. No persisted data or published interface changes.

## Executable Checklist

1. Add failing lifecycle tests and confirm the focused suite fails for the missing behavior.
2. Implement the temporary Redis command wrapper.
3. Route the npm test phase through the wrapper.
4. Update release documentation and add a decision record.
5. Run focused tests, shell/Just validation, and available release verification.
6. Mark verified acceptance criteria and commit the task-owned paths.

## Direct Rollout

Merge the commit. Operators continue running `just verify-npm-release`; no command migration is required. Environments with an external Redis retain control by exporting `REDIS_URL`.
