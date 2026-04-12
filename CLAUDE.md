# Runtime & package manager

- **Use Bun**, not npm/yarn/pnpm. All install, run, and script commands should use `bun` (e.g., `bun install`, `bun run test`, `bun add`).

# Git discipline

- **Semantic commit messages.** Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`, `perf:`, `ci:`, `build:`). Focus on what changed and why.
- **Commit frequently.** Small, focused commits reduce merge conflicts and make it easier to cherry-pick or revert.

# Cortex workflow

- **Use Cortex first.** Prefer Cortex queries over broad manual file spelunking whenever the answer can be found in the graph.
- **Start with discovery.** Use `architecture_report` or `graph_context` to understand the repo, then narrow with `search_code`, `find_symbol`, `get_symbol_info`, `get_related`, and `find_references`.
- **Check blast radius before edits.** Run `contract_check` and `impact_analysis` before changing exported APIs, shared hooks, transports, or other widely used symbols.
- **Check risk before larger changes.** Use `regression_risk_report` and `test_coverage_map` for substantive edits, and `documentation_coverage` or `consistency_check` when touching public symbols or files that should match local conventions.
- **Use architecture tools when in doubt.** `pagerank` and `leiden` help identify key files, hotspots, and module boundaries. `dead_code_detection` is useful when cleaning up or removing code.
- **Keep Cortex fresh.** After editing files, refresh the index with `ingest_files` for the changed paths so later work sees the latest code.
- **Prefer the smallest useful query.** Reach for the most specific Cortex tool that answers the question, and fall back to direct file reads only when the graph does not have enough context.

# Architecture

- **This package now publishes built ESM from `dist/`.** Browser consumers should import compiled package exports, not Bifrost source files from `node_modules`.
- **`src/*` is implementation, `dist/*` is contract.** Keep build output declaration-aware and ESM-safe so consumers do not need custom TS/Vite aliases into `node_modules/@example-app/bifrost/src`.
- **Core runtime lives in `src/client` and `src/server`.** The main architectural center is the `Client` / `ClientSocket` / `ClientHttp` side on the client and the `Server` / `ClientNode` / transport side on the server.
- **Framework adapters are thin layers over the core.** `src/react` and `src/lit` should stay adapter-focused and reuse the core client/runtime instead of reimplementing transport or auth logic.
- **Shared protocol and serialization live in `src/utils` and `src/ejson`.** Message shapes, event constants, throttling/helpers, and EJSON conversion are used across both client and server.
- **Auth is a separate slice.** `src/auth/client` and `src/auth/server` contain token/session, cookie, OAuth, and cross-tab refresh logic and should remain decoupled from transport details where possible.
- **Server extensibility is split by concern.** Decorators and registration live in `src/server/decorators`, RPC/event primitives live in `src/server/method*` and `src/server/event*`, and transport implementations live in `src/server/transports`.
- **Tests are part of the architecture, not an afterthought.** `src/test/test-utility.ts` is the shared server/client harness for higher-level integration coverage, and many behavior guarantees are easiest to understand by reading the tests alongside the runtime code.

# Critical learnings

- **Use the split test runners.** `bun run test` now chains `test:unit`, `test:integration`, and `test:browser`; do not collapse back to a single plain `vitest run`.
- **Browser tests need the browser config.** `*.browser.spec.ts(x)` files belong in `vitest.config.browser.ts` and run through Playwright-backed Vitest Browser, not Node/jsdom by accident.
- **Integration tests are intentionally separate.** `vitest.config.integration.ts` covers `src/**/*.integration.spec.ts` and the higher-level React integration file `src/react/index.test.tsx`.
- **React integration tests that talk to the real server need a Node WebSocket.** `src/react/index.test.tsx` runs in jsdom for hooks, but swaps in the `ws` implementation so the client can connect to the test server.
- **`useConnectionState` includes `isReconnecting`.** Older tests and assumptions that only check `isOnline`, `isOffline`, and `isConnecting` are stale.
- **`useObject` change detection must not rely on millisecond precision alone.** Same-millisecond deep changes can happen in tests and real code, so monotonic change tokens matter.
- **The local `throttle` helper has important semantics.** `leading: false` must still schedule the trailing invocation; if throttled event behavior looks odd, inspect `src/utils/lodash.ts` before blaming the hook layer.
- **CI must install browser dependencies explicitly.** Forgejo CI now runs browser tests and uses Playwright cache/install steps; if browser coverage changes, keep `.forgejo/workflows/ci.yml` in sync.
- **Publishing is immutable per version.** Forgejo npm rejects republishing an existing version, so bump `package.json` before retrying a failed publish of an already-existing release.
- **Built publish output is part of the release surface now.** Verify `bun run build` before publishing, and treat broken `dist` imports as release blockers.
- **Consumers should not need source aliases anymore.** If ExampleApp still needs `node_modules/@example-app/bifrost/src` aliases after a publish, treat that as a packaging regression.
