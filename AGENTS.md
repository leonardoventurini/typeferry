# TypeFerry Agent Instructions

This repo is a multi-language monorepo:

- `typeferry-ts/` — the TypeScript package `typeferry-ts` (client,
  server, auth, React, Lit, EJSON). Use exact Node.js `24.19.0` and npm
  `11.17.0`; run every npm command with `typeferry-ts/` as the working directory.
- `typeferry-py/` — the Python port (server-side feature parity).
- `PROTOCOL.md` at repo root — the normative wire-protocol spec that
  both packages implement.
- `docs/plans/` — the Python port and Rust feature-parity plans;
  `docs/conformance/` — shared conformance spec + fixtures.

# Architecture (typeferry-ts)

- **This package publishes built ESM from `typeferry-ts/dist/`.** Browser consumers should import compiled package exports, not TypeFerry source files from `node_modules`.
- **`typeferry-ts/src/*` is implementation, `typeferry-ts/dist/*` is contract.** Keep build output declaration-aware and ESM-safe so consumers do not need custom TS/Vite aliases into `node_modules/typeferry-ts/src`.
- **Core runtime lives in `typeferry-ts/src/client` and `typeferry-ts/src/server`.** The main architectural center is the `Client` / `ClientSocket` / `ClientHttp` side on the client and the `Server` / `ClientNode` / transport side on the server.
- **Framework adapters are thin layers over the core.** `typeferry-ts/src/react` and `typeferry-ts/src/lit` should stay adapter-focused and reuse the core client/runtime instead of reimplementing transport or auth logic.
- **Shared protocol and serialization live in `typeferry-ts/src/utils` and `typeferry-ts/src/ejson`.** Message shapes, event constants, throttling/helpers, and EJSON conversion are used across both client and server.
- **Auth is a separate slice.** `typeferry-ts/src/auth/client` and `typeferry-ts/src/auth/server` contain token/session, cookie, OAuth, and cross-tab refresh logic and should remain decoupled from transport details where possible.
- **Server extensibility is split by concern.** Decorators and registration live in `typeferry-ts/src/server/decorators`, RPC/event primitives live in `typeferry-ts/src/server/method*` and `typeferry-ts/src/server/event*`, and transport implementations live in `typeferry-ts/src/server/transports`.
- **The TypeScript server is Node.js-only.** `NodeHonoTransport` owns the Hono app and Node HTTP listener, and `WebSocketTransport` attaches `ws` upgrades to that same listener before it starts accepting traffic. Do not add runtime detection, alternate server frameworks, or runtime-specific ambient types.
- **Tests are part of the architecture, not an afterthought.** `typeferry-ts/src/test/test-utility.ts` is the shared server/client harness for higher-level integration coverage, and many behavior guarantees are easiest to understand by reading the tests alongside the runtime code.

# Critical learnings (typeferry-ts)

- **Use the split test runners.** `npm test` in `typeferry-ts/` chains `test:unit`, `test:integration`, and `test:browser`; do not collapse back to a single plain `vitest run`.
- **Browser tests need the browser config.** `*.browser.spec.ts(x)` files belong in `vitest.config.browser.ts` and run through Playwright-backed Vitest Browser, not Node/jsdom by accident.
- **Integration tests are intentionally separate.** `vitest.config.integration.ts` covers `src/**/*.integration.spec.ts` and the higher-level React integration file `src/react/index.test.tsx`.
- **React integration tests that talk to the real server need a Node WebSocket.** `src/react/index.test.tsx` runs in jsdom for hooks, but swaps in the `ws` implementation so the client can connect to the test server.
- **`useConnectionState` includes `isReconnecting`.** Older tests and assumptions that only check `isOnline`, `isOffline`, and `isConnecting` are stale.
- **`useObject` change detection must not rely on millisecond precision alone.** Same-millisecond deep changes can happen in tests and real code, so monotonic change tokens matter.
- **The local `throttle` helper has important semantics.** `leading: false` must still schedule the trailing invocation; if throttled event behavior looks odd, inspect `typeferry-ts/src/utils/lodash.ts` before blaming the hook layer.
- **CI must install browser dependencies explicitly.** Forgejo CI runs browser tests and uses Playwright cache/install steps; if browser coverage changes, keep `.forgejo/workflows/ci.yml` in sync.
- **Publishing is disabled while registry identities are pending.** The TypeScript package is private, the Rust workspace is non-publishable, and publication workflows are absent. Do not re-enable releases without an approved identity and migration decision.
- **Built output remains part of the future release surface.** Verify `npm run build` and `npm pack --dry-run` in `typeferry-ts/`, and treat broken `dist` imports as release blockers even while publication is disabled.
- **Use immutable npm installs.** `package-lock.json` is authoritative. CI and release verification use `npm ci`; dependency and version changes use npm commands so the manifest and lock stay coherent.
- **Consumers should not need source aliases.** The local template uses the package export surface through a file dependency; direct `src` aliases are packaging regressions.

# Protocol governance

`PROTOCOL.md` at repo root is the normative wire-protocol contract. Any
change to message envelopes, default methods, EJSON tag forms, cache
keys, or auth defaults MUST update `PROTOCOL.md` in the same commit as
the source change. Alternate implementations (`typeferry-py/`, Rust) are
expected to track the current revision and pass the shared conformance
suite under `docs/conformance/`.
