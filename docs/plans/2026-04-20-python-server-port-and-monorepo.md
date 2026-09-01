# Python Server Port & Monorepo Restructure Plan

## Context

TypeFerry today is a single TypeScript package (`typeferry-ts`) that ships
client, server, auth, React, Lit, EJSON, and utility surfaces from one
`src/` tree. The Rust parity plan
(`docs/plans/2026-04-12-rust-server-feature-parity.md`) was widened to
full server feature parity in lockstep with this plan; both now target
**full server feature parity**, not just wire compatibility.

This plan covers two concerns that must be done in the correct order:

1. **Repository restructure** — carve the current TS package into
   `typeferry-ts/` and create a sibling `typeferry-py/` without forcing a new npm
   publish or breaking existing consumers.
2. **Python server port** — produce a Python library with feature parity
   to the current TS server: every server-authoring capability, every
   transport, every default method, every auth flow, every subscription
   semantic, expressed through language-natural surfaces (decorators +
   Pydantic where TS uses decorators + Zod), and validated by shared
   conformance tests.

Client-side surfaces (`src/client`, `src/react`, `src/lit`) stay out of
scope because the existing JS client continues to be the canonical
consumer. Feature parity is a **server-side** goal.

## Decision Boundary

The Python library is successful when **all** of these hold:

### Protocol parity (wire-level)

- the existing `typeferry-ts` JS client can talk to it without knowing
  the backend is Python
- the shared conformance suite passes against both TS and Python targets
- EJSON, HTTP RPC envelope, WebSocket envelope, and Redis propagation
  are byte-for-byte compatible where the spec says they must be

### Feature parity (server-side authoring surface)

- Python decorators cover the full TS decorator matrix:
  `@Namespace`, `@Method`, `@Protected`, `@Cached`, `@Schema`, `@Use`
  (names adapted to Python conventions — `@namespace`, `@method`, etc.)
- Pydantic (or a pluggable validator interface) covers every validation
  capability Zod exposes in the current codebase: input schema
  enforcement, identical error envelope, identical failure timing
- every default method exists: `rpc:login`, `rpc:logout`, `rpc:on`,
  `rpc:off`, **`list:methods`**
- every transport has a Python counterpart (see Phase 3–4 and the
  transport matrix below), not just one Starlette path
- every auth flow works: JWT (HS256 default + configurable), cookie
  handling, session manager, device info (User-Agent parsing),
  OAuth server flows for every provider in `src/auth/server/oauth/`
- `@cached` memoization preserves canonical cache-key semantics so the
  same params on either server produce the same cache hit
- middleware ordering (`@Use`) preserves TS precedence
- context propagation via `contextvars` matches
  `TypeFerryAsyncLocalStorage.run(...)` wrapping in `src/server/method.ts`

### What is explicitly not required

- TS-identical decorator ordering at the AST level (Python uses bottom-up
  application; registration order must match even if syntax differs)
- Zod as the runtime engine (Pydantic, or a pluggable interface, is the
  Python-native equivalent)
- TS type inference parity (Python generics + `TypedDict` + Pydantic
  models provide the equivalent static story)
- React/Lit integrations (client-side, out of repo scope for the port)
- Bun/Hono/Express module shapes (transport behavior must match, module
  layout does not)
- internal module layout inside the library

## Guiding Constraint: No Unnecessary Republish

`typeferry-ts@0.2.9` is already published and immutable on the Forgejo
npm registry. The restructure itself must ship **nothing new**:

- Moving `src/` into `typeferry-ts/src/` must not change any exported API
  surface, nor the byte contents of a freshly built `dist/`.
- No version bump, no publish, until a legitimate TS change lands post-move.
- Consumer import paths (`typeferry-ts/client`, `/server`, `/react`,
  …) must remain stable because `package.json` `exports` are unchanged and
  `files: ["dist"]` continues to map to `typeferry-ts/dist/` at publish time.

If a regression forces republishing, the fix should be the smallest possible
bump on the TS package; the Python effort should not cause TS churn.

## Target Repository Shape

```
typeferry/
├── typeferry-ts/
│   ├── src/                    # current src/*
│   ├── scripts/                # current scripts/*
│   ├── package.json
│   ├── bun.lock
│   ├── bunfig.toml
│   ├── .npmrc
│   ├── tsconfig.json
│   ├── tsconfig.build.json
│   ├── vitest.config.unit.ts
│   ├── vitest.config.integration.ts
│   └── vitest.config.browser.ts
├── typeferry-py/
│   ├── pyproject.toml
│   ├── src/typeferry/…           # see Phase 2
│   └── tests/
├── docs/
│   ├── conformance/            # shared, language-neutral
│   │   ├── protocol-spec.md
│   │   └── fixtures/
│   └── plans/
├── decisions/
├── .forgejo/workflows/ci.yml   # multi-package
├── .gitignore
├── README.md                   # monorepo overview
├── CLAUDE.md                   # updated for new paths
└── AGENTS.md -> CLAUDE.md
```

Notes:

- `node_modules/`, `coverage/`, `dist/` live inside `typeferry-ts/` and stay
  gitignored.
- `.claude/` and `.codex/` stay at repo root (per-repo agent config).
- `package-lock.json` should be deleted during the move (Bun-only repo per
  `CLAUDE.md`).

## Phase 0 — Repository Restructure (no behavior change)

Goal: pure relocation. A fresh `bun run build` in `typeferry-ts/` must produce
a `dist/` byte-identical to pre-move `dist/` for the same git SHA of
`src/**`.

Pre-audit confirmation (verified against current repo):

- `tsconfig.build.json` uses `rootDir: "./src"` and `outDir: "./dist"` —
  both relative to the tsconfig, survive the move.
- `tsconfig.json` has `paths: {"typeferry-ts/*": ["./src/*"]}` with
  `baseUrl: "."` — survives because both are relative.
- `scripts/prepare-dist.mjs` resolves `new URL('../dist/', import.meta.url)`
  — survives because it's relative to the script file.
- `package.json` `exports` paths all point to `./dist/...` — survive.
- `vitest.config.*.ts` all use `path.resolve(__dirname, 'src')` — survive.
  `vitest.config.browser.ts` also aliases `typeferry-ts/` to
  `node_modules/typeferry-ts/src`, but grep shows no runtime imports
  of that specifier (only one jsdoc example in
  `src/server/decorators/register.ts`) — the alias is effectively dead
  config, and moving it is safe.
- `.gitignore` already matches `node_modules/`, `dist/`, `coverage/`
  globally, so they continue to be ignored under `typeferry-ts/`.
- Only one source file uses `__dirname`
  (`src/test/node/http.unit.spec.ts`), and it resolves a test-fixture
  `./static` directory relative to itself — survives.
- `src/server/typeferry-async-local-storage.ts` imports from `async_hooks`
  (Node built-in). Port target: Python `contextvars.Context().run()`,
  since `src/server/method.ts` wraps each call in
  `TypeFerryAsyncLocalStorage.run(...)`.

Steps:

1. `git mv` these into `typeferry-ts/`:
   - `src/`, `scripts/`
   - `package.json`, `bun.lock`, `bunfig.toml`, `.npmrc`
   - `tsconfig.json`, `tsconfig.build.json`
   - `vitest.config.unit.ts`, `vitest.config.integration.ts`,
     `vitest.config.browser.ts`
2. Keep at repo root: `CLAUDE.md`, `AGENTS.md` symlink, `README.md`,
   `decisions/`, `docs/`, `.forgejo/`, `.claude/`, `.codex/`, `.gitignore`.
3. Remove the stale `package-lock.json` from disk (it is not tracked in
   git — `CLAUDE.md` mandates Bun-only). No `bun.lock` regeneration should
   be needed because no dependency specifiers change.
4. Either leave `.gitignore` as-is (current globs already match nested
   `node_modules/`, `dist/`, `coverage/`) or tighten to explicit
   `typeferry-ts/dist/` etc. Prefer leaving as-is to minimize noise.
5. Update `.forgejo/workflows/ci.yml`:
   - Add `defaults.run.working-directory: typeferry-ts` to TS jobs (or set
     `working-directory` on each `run:` step).
   - Cache key `hashFiles('bun.lock')` must be updated to
     `hashFiles('typeferry-ts/bun.lock')`.
   - Cache `path: node_modules` must become `path: typeferry-ts/node_modules`.
   - Note: the current workflow has **no publish step**. The "tag-gated
     publish" recommendation in Phase 7 is advisory for when one is added,
     not a change to the current CI.
6. Update `CLAUDE.md`:
   - Replace `src/*` references with `typeferry-ts/src/*`.
   - Reference the new `vitest.config.*` paths under `typeferry-ts/`.
   - Add a short "Python sibling" section pointing at `typeferry-py/`.
7. Verification before commit:
   - `cd typeferry-ts && bun install && bun run typecheck`
   - `bun run test:unit && bun run test:integration && bun run test:browser`
   - `bun run build`, then `diff -r dist/ /tmp/pre-move-dist/` expects empty.
   - `git status` shows pure renames (detect renames: `git diff -M`).
8. Single commit as `chore: restructure into typeferry-ts/` — no version bump.

Exit criteria:

- Next TS release (whenever it comes) produces the same user-visible
  artifact as before.
- No `typeferry-py/` content yet; that arrives in Phase 2.

## Phase 1 — Freeze the Protocol Contract

Reuse and extend the Rust-parity spec outputs, language-neutral:

1. Write `docs/conformance/protocol-spec.md` covering:
   - HTTP envelope (`POST /__h`, `text/plain` EJSON, headers, cookies)
   - WebSocket envelope (`/typeferry-ws`, query params, `MessageType.*`)
   - Default methods: `rpc:login`, `rpc:logout`, `rpc:on`, `rpc:off`,
     `list:methods` (see `Methods` enum in `src/utils/constants.ts`)
   - Auth timing and state transitions
   - Event/channel/room semantics
   - EJSON subset and edge cases
   - Error payload shapes (incl. schema-validation failure envelope)
   - Canonical cache-key algorithm used by `@Cached` — required because
     cache keys cross the wire in cache-aware deployments
   - Redis propagation semantics
2. Extract black-box fixtures into `docs/conformance/fixtures/`:
   - `http/*.json` — request/response pairs for happy path, validation
     errors, protected-method unauth, cookie flow.
   - `ws/*.ndjson` — recorded frame sequences covering connect+auth,
     RPC success/error, void RPC, ping/pong, event delivery,
     originator exclusion.
   - `ejson/*.json` — round-trip pairs covering Date, Binary, ObjectId,
     custom-typed payloads, cache-key canonicalization, `undefined`.
3. Build a **conformance harness** that:
   - Boots any server target via a small adapter.
   - Uses only the published JS client plus raw HTTP/WS where necessary.
   - Runs the fixture matrix.
   - Lives either in `typeferry-ts/src/test/conformance/` (driven by Vitest)
     or in a top-level `conformance/` package. Prefer the former to reuse
     the existing client tests.
4. Baseline: run the harness against the current TS server; treat all
   fixtures that pass today as the frozen contract.

Exit criteria:

- Spec document and fixtures merged.
- Harness runs green against TS server in CI.
- Any TS change that would alter the wire contract must update the spec +
  fixtures explicitly.

## Phase 2 — `typeferry-py` Skeleton

Create the Python project without implementing behavior yet.

### Layout

```
typeferry-py/
├── pyproject.toml
├── README.md
├── src/typeferry/
│   ├── __init__.py
│   ├── protocol/
│   │   ├── __init__.py
│   │   ├── messages.py        # MessageType, envelopes
│   │   └── constants.py       # ports TS src/utils/constants.ts
│   ├── ejson/
│   │   ├── __init__.py
│   │   ├── presentation.py    # encode/decode, mirrors src/utils/presentation.ts
│   │   ├── converters.py
│   │   ├── custom_types.py
│   │   ├── base64.py
│   │   ├── stable_stringify.py
│   │   └── equals.py
│   ├── server/
│   │   ├── __init__.py
│   │   ├── server.py          # top-level Server
│   │   ├── client_node.py
│   │   ├── method.py
│   │   ├── methods.py
│   │   ├── event.py
│   │   ├── server_channel.py
│   │   ├── room_registry.py
│   │   ├── default_methods.py
│   │   ├── context.py         # contextvars-based, parity with typeferry-async-local-storage.ts
│   │   └── transports/
│   │       ├── __init__.py
│   │       ├── http.py        # Starlette app
│   │       ├── websocket.py   # Starlette WS
│   │       ├── ws_shared.py
│   │       └── redis.py
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── cookie_utils.py
│   │   ├── jwt_utils.py       # pyjwt, symmetric with jsonwebtoken
│   │   ├── device_info.py     # ua-parser-js equivalent
│   │   ├── session_manager.py
│   │   └── oauth/
│   ├── decorators/
│   │   ├── __init__.py
│   │   ├── method.py          # @method
│   │   ├── namespace.py       # @namespace
│   │   ├── protected.py       # @protected
│   │   ├── cached.py          # @cached with canonical key parity
│   │   ├── schema.py          # @schema (Pydantic or pluggable)
│   │   ├── use.py             # @use (middleware)
│   │   ├── register.py        # register(server, cls)
│   │   └── metadata.py        # ports src/server/decorators/metadata.ts
│   └── utils/
│       ├── errors.py
│       ├── helpers.py
│       ├── promise.py         # asyncio helpers
│       └── protocol.py        # re-export from protocol.messages
└── tests/
    ├── unit/
    └── conformance/           # consumes docs/conformance/fixtures
```

### Stack

- Python 3.12+ (match modern typing / async ergonomics).
- **ASGI app:** Starlette (HTTP + WebSocket primitives). Uvicorn dev
  server. Hypercorn as a production alternative.
- **JWT:** `pyjwt` — verify token compatibility with `jsonwebtoken`-issued
  tokens via shared fixtures.
- **Schema validation:** `pydantic` v2 as the default `@schema` engine,
  behind a `SchemaValidator` protocol so it can be swapped (parity with
  Zod being swappable in TS is not claimed, but the abstraction avoids
  Pydantic lock-in).
- **Redis:** `redis` (redis-py) with async client.
- **OAuth:** `authlib` (covers Google, GitHub, generic OIDC) — plus a
  Google-specific path using `google-auth` to match the TS
  `google-auth-library` dependency.
- **Tests:** `pytest`, `pytest-asyncio`, `httpx` for HTTP, `websockets` for
  WS client fixtures.
- **Lint/type:** `ruff`, `mypy --strict`.
- **Packaging:** `hatchling` or `uv` — Forgejo supports PyPI-style uploads.

### Authoring API (required for feature parity)

Every TS decorator must have a Python counterpart that preserves
registration order and runtime semantics:

| TS decorator        | Python decorator          | Parity requirement |
|---------------------|---------------------------|--------------------|
| `@Namespace('x')`   | `@namespace('x')`         | scoped method prefixing identical |
| `@Method()`         | `@method()` / `@method('name')` | same routing semantics, same `this`-equivalent context |
| `@Protected`        | `@protected`              | identical gating + identical unauth error envelope |
| `@Cached(ttl)`      | `@cached(ttl=...)`        | same canonical cache-key algorithm (stable EJSON of params); same TTL semantics; memoization visible through the wire layer |
| `@Schema(ZodT)`     | `@schema(PydanticModel)` or `@schema(validator=fn)` | same validation failure envelope, same failure timing (pre-handler) |
| `@Use(mw)`          | `@use(mw)`                | same outer-to-inner execution order |

Python-specific rules:

- Decorator application in Python is bottom-up; `@register.metadata`
  internally normalizes to the TS precedence, so the behavior is order-
  equivalent even if the source syntax is inverted.
- `register(server, cls)` consumes decorator metadata exactly like
  `src/server/decorators/register.ts`.
- A `Server` builder also accepts imperative registration for callers
  that do not want decorators (parity with TS callers that bypass
  decorators).

Exit criteria for Phase 2:

- `pyproject.toml` installs cleanly.
- `pytest` runs (zero tests yet, no failures).
- CI Python job exists and is green.
- Decorator module stubs exist and typecheck; no runtime behavior yet.

## Phase 3 — HTTP RPC Parity (MVP)

Mirrors Rust-parity Phase 2.

Implement:

- `POST /__h` handler.
- EJSON request parsing and response encoding via `typeferry.ejson.presentation`.
- Header semantics: `x-client-id`, `x-api-key`.
- Public vs protected method gating.
- `rpc:login`, `rpc:logout`.
- `list:methods` introspection default method
  (`Methods.LIST_METHODS` in `src/utils/constants.ts`) — required for
  feature parity, not just protocol parity.
- Identical success and error envelope shapes.
- Cookie forwarding and `Set-Cookie` response behavior.
- Schema-style validation failures encoded identically to TS (Pydantic
  errors normalized to the TS envelope).
- Rate limiting middleware equivalent to
  `src/server/transports/hono-rate-limit.ts` (Starlette middleware
  wrapping `limits`/`slowapi`).

Success:

- The JS client in `typeferry-ts/` test harness can call methods against a
  Python server spawned in CI.
- HTTP slice of the conformance suite passes against Python target.
- `list:methods` returns the same registered-method shape as TS.

## Phase 4 — WebSocket Parity

Implement:

- `/typeferry-ws` endpoint on the Starlette app.
- Query param parsing: `uuid`, `token`, `meta`.
- Full envelope set: `rpc`, `rpc:void`, `rpc:res`, `event`, `auth`, `ping`,
  `pong`.
- Correlated RPC responses keyed by `id`.
- Auth result frame immediately after connection, matching TS timing.
- Server-initiated ping, client-driven pong, disconnect-on-dead-peer
  semantics identical to `src/server/transports/ws-shared.ts`.

Success:

- Existing JS client can initialize and stay connected indefinitely.
- WebSocket slice of the conformance suite passes.

## Phase 5 — Subscriptions, Rooms, Events

Implement:

- Room registry parity (`src/server/room-registry.ts`).
- `rpc:on` and `rpc:off` with identical channel/event coupling.
- Protected event subscription gating.
- User-scoped subscriptions.
- Event envelope shape identical to TS (`uuid`, `event`, `channel`,
  `params`).
- Originator exclusion at publish time.

Success:

- Subscription flows driven by the existing JS client behave identically.
- Event/channel slice of the conformance suite passes.

## Phase 6 — Redis Multi-Instance Parity

Implement:

- Cross-instance pub/sub over Redis.
- Identical payload shape to `src/server/transports/redis-transport.ts`.
- Originator exclusion preserved across instances.
- Server registration and cleanup semantics matched where protocol depends
  on them (stats channels, liveness keys).

Success:

- Multi-instance conformance tests run with TS+Python mixed topology: a
  client connected to TS server receives events published via Python
  server, and vice versa.

## Phase 6.5 — Authoring Feature Parity

At this point the wire is covered. This phase lights up the authoring
surface so Python callers can write a server with the same ergonomics as
TS callers.

Implement:

- `@method`, `@namespace` — method registration and namespace prefixing
  identical to `src/server/decorators/method.ts` and `namespace.ts`.
- `@protected` — identical gating and error envelope to
  `src/server/decorators/protected.ts`.
- `@cached(ttl=...)` — memoization with a **canonical cache key**
  generated via the same stable-stringify algorithm the TS side uses
  (`src/ejson/stable-stringify.ts`). The key must match byte-for-byte
  given the same EJSON-encoded params so multi-instance deployments
  cache-hit across TS and Python nodes.
- `@schema(model)` — Pydantic model (or `@schema(validator=fn)`)
  producing the same validation error envelope as Zod, at the same
  lifecycle point (pre-handler).
- `@use(middleware)` — same outer-to-inner execution order as
  `src/server/decorators/use.ts`. Async middleware preserves
  `contextvars` context across `await` boundaries.
- `register(server, cls)` — metadata consumption mirroring
  `src/server/decorators/register.ts`, including `infer` equivalents
  (Python uses `Annotated` + `get_type_hints` in place of TS type
  inference — the *static* surface differs, the *runtime* surface
  doesn't).
- Imperative alternative to decorators via `Server.add_method(...)` so
  callers who avoid decorators still get full parity.

Success:

- Every decorator in `src/server/decorators/` has a working Python
  counterpart with a matched unit test.
- A port-fidelity test boots both servers with an equivalent
  decorator-driven method set and proves identical protocol behavior
  end-to-end.
- `@cached` cache keys are byte-identical to TS for the same params.

## Phase 6.75 — Auth & OAuth Feature Parity

Protocol parity in earlier phases only covers the token/cookie envelope
on the wire. This phase completes the server-authoring auth surface.

Implement, mirroring `src/auth/server/`:

- **JWT** (`jwt_utils.py`): `pyjwt`-based, HS256 default, configurable
  algorithm list, symmetric round-trip with `jsonwebtoken`-issued tokens
  verified by shared fixtures.
- **Cookie utilities** (`cookie_utils.py`): identical `SameSite`,
  `HttpOnly`, `Max-Age`/`Expires`, domain scoping. Starlette's cookie
  emitter is wrapped to normalize to the TS format.
- **Device info** (`device_info.py`): `ua-parser-js` → Python
  `ua-parser` (same upstream regex database). Assert identical parsed
  shape against a fixture matrix of user-agent strings.
- **Session manager** (`session_manager.py`): identical session
  lifecycle — create, refresh, expire, revoke — with the same storage
  abstraction (pluggable: memory / Redis).
- **OAuth providers** (`oauth/`): enumerate every provider present in
  `src/auth/server/oauth/` and ship a Python equivalent. Google goes
  through `google-auth` to mirror `google-auth-library`; generic OIDC
  providers go through `authlib`. Redirect URIs, state handling, and
  callback payloads must match byte-for-byte on the wire.

Success:

- JWT round-trip fixtures pass in both directions (TS-signed → Python-
  verified and vice versa).
- OAuth callback flows complete against the same mock IdP from both
  servers with identical session + cookie output.
- Device-info parsing matches against a shared fixture matrix.

## Phase 7 — Release Engineering

Two independent packages, two independent release cadences.

### `typeferry-ts`

- Unchanged publish flow: bump `typeferry-ts/package.json` version, tag,
  Forgejo npm publish from `typeferry-ts/dist/`.
- No change in package name, exports, or consumer import paths.

### `typeferry-py`

- Package name candidate: `typeferry-py` on PyPI, or Forgejo-hosted
  PyPI package.
- Versioning milestones:
  - `0.1.0` — HTTP parity (Phase 3)
  - `0.2.0` — WS parity (Phase 4)
  - `0.3.0` — subscriptions / rooms / events (Phase 5)
  - `0.4.0` — Redis multi-instance (Phase 6)
  - `0.5.0` — authoring decorators + `@cached` + `@schema` (Phase 6.5)
  - `0.6.0` — auth/OAuth feature parity (Phase 6.75)
  - `1.0.0` — full feature parity declared, conformance green against
    TS for all Phase 8 fixtures
- Publish guarded by tag, same immutability assumption.

### CI Topology

Update `.forgejo/workflows/ci.yml` to:

- **Path-filtered jobs:**
  - TS jobs run on changes under `typeferry-ts/**` or `docs/conformance/**`.
  - Python jobs run on changes under `typeferry-py/**` or
    `docs/conformance/**`.
- **Conformance matrix job:**
  - Boots TS server, runs harness → must be green.
  - Boots Python server, runs harness → must be green.
  - Blocks merge on either target failing.
- Keep arm64 runner baseline (see
  `decisions/2026-04-18-ci-arm64-runner.md`).

## Phase 8 — Conformance as Release Gate

- Both packages gate release on the shared conformance suite.
- Any protocol-shape change requires updating `docs/conformance/` first,
  then updating both implementations.
- Treat wire fixtures as the authoritative contract; prose in the spec is
  documentation of the fixtures, not an independent source of truth.

## Risk Register

### EJSON Fidelity (highest risk)

JS Date, `Binary`, `undefined`, custom typed payloads, and deterministic
cache-key canonicalization are the most likely parity trap. Mitigation:

- Port `src/ejson/*` first, before any server logic, against shared
  fixtures. Zero test tolerance for divergence.
- Use `src/ejson/stable-stringify.ts` as the canonical key algorithm and
  reproduce it verbatim in Python.

### Async Context Propagation

`src/server/typeferry-async-local-storage.ts` uses Node's `AsyncLocalStorage`.
Python's `contextvars` behaves similarly but diverges in task spawning
rules. Lock down with explicit tests: nested method calls, concurrent
subscriptions, middleware → handler context handoff.

### Cookie & `Set-Cookie` Semantics

Starlette's cookie model differs from Express/Hono. Small mismatches
(`SameSite`, `HttpOnly`, domain scoping, `Max-Age` vs `Expires`) look like
auth flakiness, not wire mismatches. Capture current TS behavior in
fixtures byte-for-byte.

### JWT Compatibility

`src/auth/server/jwt-utils.ts` defaults to `HS256` via `jsonwebtoken`
(`config.algorithm ?? 'HS256'`). `pyjwt` must agree on:
- supported algorithms (HS256 default, plus whatever callers configure)
- claim naming (`iat`, `exp`, `sub`)
- clock-skew handling
- secret/keypair loading format
Validate via fixtures containing pre-signed tokens from each side.

### Middleware Ordering

TS decorators compose at import time with a fixed precedence
(`@Protected` outermost, etc.). Python registration order must reproduce
this precedence regardless of decorator syntax choice.

### Git History on Move

Phase 0 must produce a pure rename detectable by `git log --follow`. Avoid
simultaneous content edits during the move commit. Reviewers should see
`R100` rename markers for every file.

### Forgejo Publish Immutability

The current `.forgejo/workflows/ci.yml` does not publish at all — release
is a manual `bun publish` from a checkout. The reorg therefore cannot
accidentally republish. When a publish step is later added, gate it on a
tag trigger, not a branch push, so an unchanged `typeferry-ts/package.json`
cannot race against the registry's immutability rule.

### Consumer Import Paths

ExampleApp consumers must continue to import from `typeferry-ts/*`
only. If anyone currently imports
`node_modules/typeferry-ts/src/...` (a known regression per
`CLAUDE.md`), fix those consumers before the move lands so the reorg does
not get blamed for a preexisting issue.

## Explicit Non-Goals

- Python client library (the existing JS client remains canonical).
- Python-side React/Lit equivalents (client-side surface, out of scope).
- TS-identical decorator syntax or TS-identical static type inference
  (Python ports the *semantics*, not the syntax).
- Zod as the runtime schema engine (Pydantic is the Python-native
  equivalent, behind a pluggable interface).
- Deprecating or freezing the TS server.
- Publishing a new TS artifact as part of the restructure.
- Line-by-line internal architecture parity.
- Multi-language monorepo tooling (Nx, Turborepo, Bazel); the directory
  split + path-filtered CI is sufficient.

Authoring decorators, `@schema`, `@cached`, `@use`, `list:methods`, rate
limiting, OAuth providers, and session management are **in scope** and
tracked in Phases 3, 6.5, and 6.75 — they are no longer deferred.

## Order of Operations

1. **Phase 0** — restructure lands in one atomic commit; verify
   `dist/` byte-identity.
2. **Phase 1** — freeze protocol spec and conformance harness against
   current TS server.
3. **Phase 2** — stand up `typeferry-py` skeleton (incl. decorator module
   stubs) with CI green at zero tests.
4. **Phase 3** — Python HTTP parity incl. `list:methods` and rate
   limiting; conformance HTTP slice green.
5. **Phase 4** — Python WebSocket parity; conformance WS slice green.
6. **Phase 5** — Python subscriptions; conformance event slice green.
7. **Phase 6** — Python Redis parity; mixed-topology conformance green.
8. **Phase 6.5** — authoring decorators (`@method`, `@namespace`,
   `@protected`, `@cached` with canonical keys, `@schema` via Pydantic,
   `@use` middleware); decorator-driven server passes the full
   conformance suite.
9. **Phase 6.75** — auth & OAuth feature parity; JWT round-trip and
   OAuth callback fixtures green.
10. **Phase 7** — independent release engineering per package.
11. **Phase 8** — conformance becomes the cross-language release gate;
    Python hits `1.0.0` when the full feature parity checklist is green.

Do not start Python implementation before the spec and fixtures exist.
Without a frozen contract, Python parity claims will drift exactly the
same way the Rust plan warns about.
