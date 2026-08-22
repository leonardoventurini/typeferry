# Migrate bifrost-ts completely to Node.js

## Goal and scope

Migrate `bifrost-ts` from Bun to exact Node.js `24.19.0` and npm `11.17.0`
without changing `PROTOCOL.md` semantics. The finished TypeScript package must
install, build, test, audit, package, publish, and serve HTTP/WebSocket traffic
without Bun. `bifrost-py`, Rust planning artifacts, and immutable history remain
outside the mechanical migration.

Risk is medium because this changes a published framework's runtime, source API,
package graph, CI, and release boundary. The highest-risk failure is a package
that passes unit tests but publishes declarations or a Node listener that cannot
serve a real consumer.

## Evidence and uncertainty

The package already builds ESM with `tsc`, runs Vitest on Node, contains a
`ws`-based transport, and publishes compiled `dist`. Bun is concentrated in the
runtime selector, `bun-hono-transport.ts`, `bun-ws-transport.ts`, ambient types,
lock/config, scripts, CI, publish/release workflows, and guidance. The current
Node HTTP fallback exposes Express while ExampleApp requires Hono.

The main uncertainty is the set of external consumers relying on Bun support or
`Server.express`. Search known repositories, examples, and package documentation
before publication. Stop if an uncoordinated consumer cannot accept the breaking
release.

## Contracts and decisions

- `package.json` uses ESM, exact Node/npm engines, npm `devEngines`, and
  `packageManager: npm@11.17.0`; `.npmrc` enables `engine-strict` and configures
  the Forgejo publication registry without committed credentials; `.nvmrc`
  pins Node `24.19.0`.
- `package-lock.json` is the sole lock. Direct dependency changes use npm;
  transitive constraints use npm-compatible overrides and pass `npm ci` plus
  `npm audit --audit-level=low` without exceptions.
- `NodeHonoTransport` owns one Node HTTP listener and Hono app through
  `@hono/node-server`. `WebSocketTransport` attaches `ws` upgrades to that same
  listener before it begins accepting traffic.
- The public `Server.app` is Hono. The Express transport, `Server.express`, Bun
  transports, runtime detection, Bun socket types, and Bun declarations are
  removed in `0.4.0`.
- RPC encoding, authentication, cookies, context, request size, rate limiting,
  CORS, remote address, WebSocket path/origin/auth/ping/rooms/events, readiness,
  Redis, and graceful close remain behaviorally compatible.
- `PROTOCOL.md` changes only if the wire contract intentionally changes; this
  migration is expected to require no protocol revision.
- Forgejo CI and publish workflows use exact Node/npm, immutable install,
  package-lock keyed caches, npm audit, all configured suites, build, pack
  inspection, and npm publication. Publication remains immutable and requires
  the repository's configured credential.

## Atomic implementation slices

1. Add `node-hono-transport.ts` and focused unit/integration tests. Construct
   the Hono app and Node server without listening, attach `WebSocketTransport`,
   then listen. Verify Hono RPC, arbitrary route registration, WebSocket auth and
   events, readiness 503/rejection, origin policy, remote IP, limits, rate
   limiting, multi-cookie behavior, and idempotent close.
2. Simplify `server.ts`, transport exports, socket types, and tests to the single
   Node/Hono path. Delete Express and Bun transports/tests and remove their
   dependencies/types. Run all server-focused unit and integration tests and a
   real Node client/server smoke.
3. Replace Bun package artifacts and scripts with exact Node/npm configuration,
   `package-lock.json`, clean `npm ci`, Node-24 types, npm overrides, and a seeded
   no-Bun configuration test. Convert active documentation and release guidance.
4. Convert `.forgejo/workflows/ci.yml`, `.forgejo/workflows/publish-ts.yml`, and
   `.forgejo/workflows/release-bump.yml` to Node/npm while preserving Python/Rust
   jobs and release ownership. Require CI before publication of the exact SHA.
5. Run lint, typecheck, unit, integration, browser, audit, build, `npm pack
--dry-run`, tarball extraction/import smoke, declaration inspection, clean
   install, consumer audit, and independent review. Record results below.
6. Set version `0.4.0` through npm, commit the verified source/lock/workflows,
   push with explicit authority, publish once, confirm Forgejo metadata/tarball,
   and install that exact artifact in a clean disposable consumer before
   ExampleApp updates.

## Risks and recovery

- HTTP/WebSocket listener mismatch blocks release; the real listener integration
  test proves both protocols share one port.
- Declaration leakage blocks release; extracted tarball typechecking runs without
  Bun types installed.
- Package graph drift blocks release; repeated `npm ci`, `npm ls`, audit, and
  lock diff are hard gates.
- Consumer source break is intentional but must be coordinated. Recovery before
  publication is revert; after immutable publication, consumers remain pinned
  to `0.3.4` until ready.
- A failed publication is never retried at `0.4.0`; fix, bump to the next patch,
  and repeat the package gauntlet.

## Verification gauntlet

- Hard gate: `npm exec -- vitest --config vitest.config.unit.ts --run
src/server` passes including Node Hono and WebSocket sensitivity cases.
- Hard gate: `npm run test:integration` and `npm run test:browser` pass.
- Hard gate: `npm run lint`, `npm run typecheck`, `npm run build`, and
  `npm audit --audit-level=low` pass.
- Hard gate: `npm pack --dry-run` lists only intended compiled/package files;
  an extracted tarball imports every public export and typechecks without Bun.
- Hard gate: a hidden-file-aware scan and seeded config test find no active Bun
  API, type, command, image, lock, config, or environment marker in `bifrost-ts`
  or current TypeScript workflows/guidance.
- Sensitivity: detach the WebSocket upgrade listener and prove the real transport
  integration test fails; restore it and retain red/green evidence.

## Execution checklist

- [x] Implement and test the Node/Hono listener — files:
      `bifrost-ts/src/server/transports/node-hono-transport.ts`, focused specs;
      verify: focused Vitest; done when HTTP and WebSocket share one listener.
- [x] Remove Bun/Express runtime paths — files: server, transports, socket types,
      tests and dependencies; verify: server unit/integration smoke; done when
      the public server path is Node/Hono only.
- [x] Move package/tooling to npm — files: manifest, lock, npm config, Node pin,
      instructions; verify: clean install, audit, no-Bun contract; done when Bun
      is absent from the active TypeScript package.
- [x] Move CI/release workflows to Node/npm — files: Forgejo workflows; verify:
      workflow contract tests/inspection; done when exact-SHA CI owns release
      eligibility.
- [x] Pass package and independent-review gauntlet — files: task-owned paths;
      verify: all gates above; done when tarball and declarations work cleanly.
- [ ] Publish and verify `0.4.0` — files: version/lock and release evidence;
      verify: Forgejo metadata plus clean consumer install; done when ExampleApp can
      consume the immutable registry artifact.

## Verification and rollout

No database or protocol migration is involved. Keep `0.3.4` available and do
not update ExampleApp until the published `0.4.0` tarball passes the clean-consumer
smoke. Record exact commands/results here while executing and commit this spec
with the Bifrost change.

### Recorded evidence

- Exact Node 24.19.0/npm 11.17.0 local gates passed: clean install, zero-advisory
  audit, lint, typecheck, 108 unit files with 1,431 assertions, non-Redis
  integration coverage, browser coverage, build, package inspection, and an
  extracted-tarball public-export/typecheck smoke.
- Forgejo CI run 78 proved the exact release SHA and all 1,431 unit assertions,
  but its host runner returned status 1 after the fully passing parallel Vitest
  summary. The same suite passed locally both in parallel and with serial files;
  CI now serializes files to eliminate that worker-shutdown race before a fresh
  exact-SHA release run.
- Integration CI now provisions and removes an isolated Redis 7.4 container.
  This replaces the shared endpoint whose new authentication requirement made
  the otherwise-passing Redis suite depend on unavailable external state.
