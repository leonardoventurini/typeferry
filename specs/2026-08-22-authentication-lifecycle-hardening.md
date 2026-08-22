# Publish authentication lifecycle hardening as Bifrost 0.3.4

## Goal and scope

Move the framework-owned authentication and readiness fixes currently carried
as a ExampleApp `patchedDependency` into Bifrost source, publish compiled ESM as
`@example-app/bifrost@0.3.4`, and upgrade ExampleApp to that immutable release.

The Bifrost release owns HTTP status preservation, stale reconnect-timer
cancellation, React auth subscription reconciliation, Node/Bun HTTP readiness
gating, and matching custom `SameSite` support when clearing refresh cookies.
ExampleApp continues to own its `SameSite=Strict` application policy explicitly;
Bifrost's generic `SameSite=Lax` default and protocol revision remain unchanged.

Risk is high because package publication is externally visible and immutable.
Abort before publish if source tests, emitted `dist`, tarball contents, or the
ExampleApp consumer tests disagree. No database or wire-envelope migration is in
scope.

## Evidence and uncertainty

- ExampleApp's temporary patch changes six compiled Bifrost files and has already
  passed cold-start, expired-token, reload, wake, readiness, and transport
  regression coverage.
- The Bifrost checkout is clean on `main`; Forgejo currently reports `0.3.3` as
  the latest npm package version.
- Bifrost publishes only `bifrost-ts/dist`, and `prepublishOnly` rebuilds it.
- The source `CookieOptions` contract already documents `Strict` while the
  normative protocol and all implementations intentionally default to `Lax`.
  Changing the framework default would require a protocol revision and
  coordinated Python/Rust changes, so ExampleApp must express its stricter policy
  rather than silently changing the generic package default.

The main uncertainty is release artifact fidelity: a green source test is not
enough if the npm tarball omits or misbuilds a fix. The release gate therefore
inspects packed compiled files and then installs the published version into the
real ExampleApp consumer.

## Contracts and decisions

- Non-200 HTTP failures reject with an exported error carrying the exact HTTP
  `status`, preserving authentication error classification across transport.
- Every explicit `ClientSocket.connect()` cancels a pending exponential-backoff
  timer before evaluating or creating a socket.
- `useAuth()` reconciles once after its event subscription is installed and
  treats the client instance as a dependency, closing the render-to-effect gap.
- Node and Bun HTTP RPC transports return `503 Server Not Ready` with
  `Retry-After: 1` while `server.acceptConnections` is false. Existing
  WebSocket transports retain the same readiness gate.
- Refresh-cookie clearing accepts the same optional `sameSite` policy as
  setting. Both continue to default to `Lax`; ExampleApp supplies `Strict` for
  every set and clear operation.
- Publication is allowed only after source tests, emitted ESM inspection,
  tarball inspection, and a clean signed commit. The pushed commit must be the
  exact source of the package.

## Integrated implementation checklist

1. Implement the framework fixes beside their existing source tests in
   `bifrost-ts/src`; verify the focused Vitest files fail without and pass with
   the changes.
2. Preserve the generic cookie protocol while adding custom clear-policy
   symmetry; verify default Lax and explicit Strict set/clear cases.
3. Run Bifrost unit, integration, browser, lint, typecheck, build, security
   audit, and package inspection gates; stop on any failure, advisory, or
   unexpected tarball path.
4. Bump to `0.3.4` with Bun, commit and push the verified source, publish once,
   and confirm Forgejo lists the new immutable version.
5. Upgrade ExampleApp with Bun, express `SameSite=Strict` in application source,
   remove the patch file and patched-dependency metadata, then rerun all focused
   authentication, build, lint, type, and install-from-lock gates.
6. Update both repositories' durable rollout records, commit ExampleApp, and
   verify both worktrees contain only the intended commits.

## Risks and recovery

- A package built from stale or incomplete output would break every consumer.
  Source/build/tarball comparisons block publication; after publication,
  recovery is a corrective `0.3.5`, never republishing `0.3.4`.
- Removing readiness gates would reintroduce cold-start anonymous sockets or
  `METHOD_NOT_FOUND`. Direct Node/Bun HTTP and Bun WebSocket tests block the
  release; ExampleApp's startup tests remain the consumer-level oracle.
- Changing Bifrost's cookie default would silently alter other consumers and
  cross-language conformance. The release preserves Lax and tests ExampleApp's
  explicit Strict policy instead.
- An upgrade that still resolves the patch or a local link would provide false
  confidence. ExampleApp must have no Bifrost patch entry/file, its lockfile must
  resolve `0.3.4`, and a frozen install must reproduce the package.
- If push succeeds but publish fails, fix the release problem and publish the
  same committed `0.3.4` only if Forgejo confirms that version is absent. If the
  version exists with a bad artifact, publish a corrective `0.3.5`.

## Verification gauntlet

- **HTTP status hard gate:** non-200 response → typed status-bearing rejection;
  focused `client-http` unit test must assert the exact status.
- **Reconnect hard gate:** scheduled backoff + explicit connect → one socket;
  focused `client-socket` fake-timer test must detect a stale second socket.
- **React hard gate:** client state changes during subscription → post-effect
  authenticated state; focused `use-auth` test must fail without reconciliation.
- **Readiness hard gate:** `acceptConnections=false` → Node and Bun HTTP 503,
  `Retry-After: 1`, and no RPC dispatch; focused transport tests must cover both.
- **Cookie hard gate:** default remains Lax while explicit Strict is identical on
  set and clear; cookie utility tests must assert both contracts.
- **Artifact hard gate:** `bun run build` and `bun pm pack --dry-run` must contain
  compiled implementations and declarations only under `dist`.
- **Consumer hard gate:** ExampleApp frozen install, 71 authentication Chromium
  tests, 24 focused unit tests, 18 auth/session integration tests, lint,
  typecheck, and client/server builds must pass without a Bifrost patch.

## Execution checklist

- [x] Implement Bifrost source contracts and focused regression tests.
- [x] Verify emitted ESM, declarations, dependency audit, and package tarball
      contents.
- [x] Commit, push, publish, and confirm `@example-app/bifrost@0.3.4` in Forgejo.
- [x] Upgrade ExampleApp and remove every temporary Bifrost patch reference.
- [x] Complete consumer verification and commit the direct dependency upgrade.

## Verification and rollout

The Bifrost package is published only after every framework gate passes. The
published package is then exercised by ExampleApp rather than trusting a local
link. Abort the ExampleApp rollout if its lockfile resolves anything other than
`0.3.4`, the installed files differ from the release contract, or any existing
authentication oracle regresses. Rollback before deployment is ExampleApp commit
reversion to `0.3.3` plus its patch; after deployment, prefer a corrective
Bifrost patch release and normal ExampleApp upgrade.

## Progress record

### 2026-08-22 — framework contracts implemented

- Added status-bearing HTTP failures, explicit-connect backoff cancellation,
  post-subscription React reconciliation, and matching Node/Bun readiness gates.
- Preserved Bifrost's Lax cookie default while allowing an application-supplied
  SameSite policy to survive cookie clearing.
- Six focused unit files passed 137 tests; lint and typecheck passed.
- Sensitivity evidence is inherited from the consumer investigation: without
  reconnect-timer cancellation the socket oracle observed two sockets, and
  without post-subscription reconciliation the valid-token reload remained
  unauthenticated.

### 2026-08-22 — release candidate verified

- Upgraded vulnerable direct and transitive dependencies to patched releases;
  `bun audit` reports no vulnerabilities across the resolved release graph.
- Passed lint, strict typecheck, build, 1,540 unit tests, 55 integration tests
  with 5 intentional skips, and 9 Chromium browser tests.
- Inspected emitted JavaScript and declarations for all six framework
  contracts. `bun pm pack --dry-run` contains 424 compiled files under `dist`
  plus the release manifest and identifies the artifact as
  `@example-app/bifrost@0.3.4`.

### 2026-08-22 — direct rollout completed

- Published `@example-app/bifrost@0.3.4` from signed commit `2847379`; Forgejo and
  the package registry both resolve the immutable release and its recorded
  integrity.
- ExampleApp now resolves the registry package at `0.3.4`, has no Bifrost patch
  entry or compiled patch file, and expresses its Strict cookie policy through
  shared application-owned options.
- The installed consumer passed a frozen install, 71 Chromium authentication
  tests, 24 focused unit tests, 18 session integration tests, lint, both strict
  TypeScript configurations, client/server production builds, and the public
  dependency audit. The upstream package audit remains clean for the private
  package graph that ExampleApp's registry audit intentionally skips.
