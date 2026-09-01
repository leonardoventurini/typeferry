# Rust Server Feature Parity Plan

> **Scope update (2026-04-20):** this plan originally targeted protocol
> parity only. It has been widened to **full server feature parity** to
> match the Python plan (`2026-04-20-python-server-port-and-monorepo.md`).
> Wire compatibility is the floor; authoring ergonomics, default methods,
> auth surface, and caching semantics are now explicit goals expressed
> through language-natural Rust surfaces (macros + `serde` + a validator
> trait) rather than direct TS ports.

## Context

TypeFerry is currently a TypeScript-first RPC and realtime framework. The server
runtime lives in `src/server` and `src/auth/server`, while the browser-facing
contract is consumed by the existing JS/TS client in `src/client`.

A Rust server reimplementation is a worthwhile investment **because** the
runtime concerns (EJSON, transports, rooms, Redis propagation, auth) carry
real operational value, and the authoring concerns (decorators, schema
validation, caching) have natural Rust equivalents.

Client-side concerns are out of scope because the JS client remains the
canonical consumer:

- React adapter ergonomics
- Lit adapter ergonomics
- inferred client types

Server-side concerns are in scope and must be feature-parity:

- every default method (incl. `list:methods`)
- every transport semantic (HTTP RPC, WS, Redis)
- every decorator equivalent (`@Namespace`, `@Method`, `@Protected`,
  `@Cached`, `@Schema`, `@Use`)
- every auth flow (JWT, cookies, sessions, device info, OAuth providers)
- `@Cached` canonical cache-key semantics so multi-instance TS+Rust
  deployments cache-hit identically

## Decision Boundary

A Rust server is successful when **both** hold:

### Protocol parity (wire-level)

- full protocol parity with the existing TypeFerry server
- existing JS client can talk to it without knowing or caring that the
  backend is no longer the TypeScript server
- shared conformance suite passes against both TS and Rust targets

### Feature parity (server-side authoring surface)

- Rust macros (proc-macro attributes) cover the full TS decorator matrix:
  `#[typeferry::namespace]`, `#[typeferry::method]`,
  `#[typeferry::protected]`, `#[typeferry::cached]`, `#[typeferry::schema]`,
  `#[typeferry::r#use]` — names adapted to Rust conventions
- a `SchemaValidator` trait covers every validation capability Zod
  exposes today (default implementation via `serde` + `validator`
  crate; pluggable for custom validators), producing identical error
  envelopes at the same lifecycle point
- every default method exists: `rpc:login`, `rpc:logout`, `rpc:on`,
  `rpc:off`, **`list:methods`**
- every auth flow works: JWT (HS256 default via `jsonwebtoken` crate,
  configurable algorithms), cookie handling, session manager, device
  info (`woothee` or `uaparser` crate), OAuth server flows for every
  provider in `src/auth/server/oauth/`
- `#[cached]` memoization preserves canonical cache-key semantics —
  same stable-stringify algorithm as TS so cache hits cross the
  language boundary
- middleware ordering (`#[r#use]`) preserves TS precedence
- context propagation via `tokio::task_local!` (or `tracing::Span`)
  matches `TypeFerryAsyncLocalStorage.run(...)` wrapping in
  `src/server/method.ts`

### What is explicitly not required

- identical internal architecture or module layout
- TS-identical macro syntax (Rust proc-macros read differently; the
  *semantics* must match, not the source shape)
- TS-identical decorator ordering at the AST level (macro expansion
  order is normalized to match TS registration precedence)
- Zod as the runtime engine (a validator trait is the Rust-native
  equivalent)
- TypeScript type inference parity (Rust's own generic system provides
  the equivalent static story)
- reimplementation of React/Lit integration (client-side)

## Current Implementation Landing Zone

The first reusable Rust implementation now lives inside the SolidScript
workspace rather than inline in `solidscript-server`:

- `crates/typeferry-protocol`
- `crates/typeferry-runtime`

That split is the required precursor to any future `typeferry-rs` repository.

## Source Of Truth

The current protocol contract is defined by runtime behavior in these files:

- `src/utils/protocol.ts`
- `src/utils/constants.ts`
- `src/utils/presentation.ts`
- `src/ejson/*`
- `src/server/transports/http-transport.ts`
- `src/server/transports/bun-hono-transport.ts`
- `src/server/transports/websocket-transport.ts`
- `src/server/transports/ws-shared.ts`
- `src/server/method.ts`
- `src/server/methods.ts`
- `src/server/event.ts`
- `src/server/client-node.ts`
- `src/server/transports/redis-transport.ts`

The compatibility target should be derived from those files and locked down by
conformance tests instead of prose-only interpretation.

## What Protocol Parity Means

Protocol parity should include these guarantees.

### HTTP RPC parity

- identical endpoint path: `POST /__h`
- identical request body envelope:
  - `context`
  - `payload`
- identical `text/plain` EJSON request and response encoding
- identical header behavior for:
  - `x-client-id`
  - `x-api-key`
- identical success and error payload shape
- identical protected-method behavior
- identical handling of schema-style validation failures at the wire level
- identical cookie forwarding and `Set-Cookie` response behavior

### WebSocket parity

- identical path: `/typeferry-ws`
- identical query parameter semantics for:
  - `uuid`
  - `token`
  - `meta`
- identical message envelope types:
  - `rpc`
  - `rpc:void`
  - `rpc:res`
  - `event`
  - `auth`
  - `ping`
  - `pong`
- identical ping/pong liveness behavior from the client's point of view
- identical auth result timing semantics on connection

### RPC semantics parity

- same default methods:
  - `rpc:login`
  - `rpc:logout`
  - `rpc:on`
  - `rpc:off`
  - `list:methods`
- same protected/public gating behavior
- same middleware ordering semantics
- same cache-visible semantics for cached methods
- **same canonical cache-key algorithm** (stable-stringify over EJSON
  params) so cache hits cross TS ↔ Rust in multi-instance deployments
- same request correlation behavior for RPC responses
- same fire-and-forget behavior for `rpc:void`

### Event and channel parity

- same room naming semantics
- same subscription behavior for channel/event combinations
- same user-channel protection behavior
- same event payload envelope
- same originator-exclusion semantics
- same cluster propagation semantics from the subscriber's perspective

### Auth/context parity

- same token extraction semantics from:
  - `x-api-key`
  - WebSocket query token
- same authenticated vs unauthenticated method behavior
- same client-visible logout/auth result behavior
- same context attachment semantics needed by the current JS client

### Serialization parity

- same `Presentation.encode/decode` behavior at the wire level
- same EJSON round-tripping guarantees for supported built-in types
- same deterministic encoding expectations where caching depends on encoded
  params

### Redis cluster parity

- same cross-instance event propagation behavior
- same exclusion semantics for originator-aware events
- equivalent stats and cleanup behavior where the protocol depends on them

## What Is Explicitly Out Of Scope

Client-side and syntax-level concerns stay out of scope:

- React hooks (client-side)
- Lit controllers (client-side)
- TS-identical macro syntax (Rust proc-macros match *semantics*, not
  source shape)
- Bun, Express, or Hono implementation parity at the module level
  (transport *behavior* is in scope; the underlying framework choice
  is not)
- line-by-line code structure parity

**Previously out of scope, now in scope** (with Rust-native surfaces):

- authoring macros that cover `@Namespace`, `@Method`, `@Protected`,
  `@Cached`, `@Schema`, `@Use` — required, see Phase 5.5
- schema validation layer (Zod → `SchemaValidator` trait with a default
  `serde + validator` implementation) — required, see Phase 5.5
- `list:methods` default method — required, see Phase 2
- `@Cached` with canonical cache keys byte-identical to TS — required,
  see Phase 5.5
- OAuth server flows for every provider in `src/auth/server/oauth/` —
  required, see Phase 5.75

## Recommended Delivery Strategy

The effort should be split into a specification phase and an implementation
phase.

### Phase 0: Freeze the protocol contract

Create a dedicated protocol specification document and conformance matrix that
covers:

- HTTP envelope
- WebSocket envelope
- authentication and logout behavior
- event subscription semantics
- EJSON compatibility scope
- error payloads
- Redis propagation semantics

This should cite exact current source files and exact existing tests.

Output:

- one protocol spec
- one conformance checklist

### Phase 1: Extract conformance tests from implementation tests

The current test suite is broad, but much of it is implementation-shaped.
Introduce a new test slice that treats the server as a black box and can run
against either:

- the current TS server
- a future Rust server

The existing JS client should remain the primary compatibility harness.

Minimum conformance suites:

- HTTP RPC happy path and failures
- WebSocket connect/auth/ping/pong
- method protection
- `rpc:on` and `rpc:off`
- event delivery and channel semantics
- logout behavior
- cookie-bearing auth flows
- Redis-backed multi-instance event propagation

Output:

- transport-agnostic conformance tests
- a server target abstraction that points tests at TS or Rust

### Phase 2: Implement Rust MVP with HTTP RPC only

Build a Rust server that can satisfy:

- `POST /__h`
- EJSON request parsing and response encoding
- protected/public method execution
- `rpc:login` and `rpc:logout`
- `list:methods` introspection default method
  (`Methods.LIST_METHODS` in `src/utils/constants.ts`) — required for
  feature parity
- context/token handling
- rate limiting middleware equivalent to
  `src/server/transports/hono-rate-limit.ts` (tower layer over axum)

This phase deliberately excludes WebSockets so the first milestone is a small,
deterministic compatibility surface.

Recommended Rust stack:

- `axum` + `tower` (HTTP + middleware)
- `tokio` (runtime)
- `serde` + `serde_json` (baseline JSON; EJSON layered on top)
- `jsonwebtoken` crate for JWT
- `redis` crate for Redis transport
- EJSON: extend the existing `typeferry-protocol` crate in the
  SolidScript workspace, or fork it into a dedicated ejson crate

Success criteria:

- the JS client can perform HTTP method calls against the Rust server
- the conformance suite passes for HTTP-only behavior
- `list:methods` returns the same registered-method shape as TS

### Phase 3: Add WebSocket protocol parity

Implement:

- `/typeferry-ws`
- query param parsing for `uuid`, `token`, and `meta`
- message envelope parsing
- correlated RPC responses
- auth result frames
- ping/pong and disconnect handling

Success criteria:

- the existing JS client can initialize and stay connected
- websocket conformance tests pass against Rust

### Phase 4: Add subscriptions, rooms, and events

Implement:

- room registry semantics
- `rpc:on`
- `rpc:off`
- protected event subscription logic
- user-scoped subscription logic
- event propagation envelopes
- originator exclusion

Success criteria:

- existing subscription flows work unchanged from the client side
- event/channel conformance tests pass

### Phase 5: Add Redis multi-instance parity

Implement:

- cross-instance publish/subscribe
- payload shape parity
- originator exclusion semantics across instances
- cleanup and server registration behavior needed by compatibility tests

Success criteria:

- multi-instance event propagation tests pass against Rust

### Phase 5.5: Authoring feature parity (proc-macro layer)

At this point the wire is fully covered. This phase lights up the
authoring surface so Rust callers can write a server with the same
ergonomics as TS callers.

Implement proc-macros mirroring `src/server/decorators/`:

| TS decorator        | Rust macro                    | Parity requirement |
|---------------------|-------------------------------|--------------------|
| `@Namespace('x')`   | `#[typeferry::namespace("x")]`  | scoped method prefixing identical |
| `@Method()`         | `#[typeferry::method]`          | same routing semantics, same context access |
| `@Protected`        | `#[typeferry::protected]`       | identical gating + identical unauth error envelope |
| `@Cached(ttl)`      | `#[typeferry::cached(ttl = ...)]` | **canonical cache-key parity with TS** (stable EJSON of params); same TTL semantics |
| `@Schema(ZodT)`     | `#[typeferry::schema(MyStruct)]` | validation via `SchemaValidator` trait; same failure envelope and timing |
| `@Use(mw)`          | `#[typeferry::r#use(mw)]`       | same outer-to-inner execution order |

Ship a Rust-native `SchemaValidator` trait. Default implementation uses
`serde` deserialization + the `validator` crate. Consumers can plug in
alternatives.

Also ship an imperative registration path (`Server::add_method(...)`)
for callers who prefer not to use macros, mirroring the TS imperative
alternative.

Success criteria:

- every decorator in `src/server/decorators/` has a working Rust macro
  counterpart with matched unit tests
- a port-fidelity test boots both servers with equivalent macro-driven
  method sets and proves identical protocol behavior end-to-end
- `#[cached]` cache keys are byte-identical to TS for the same params
- context propagation across async boundaries matches
  `TypeFerryAsyncLocalStorage` (validated with nested-method and
  middleware-to-handler tests)

### Phase 5.75: Auth & OAuth feature parity

Implement, mirroring `src/auth/server/`:

- **JWT**: `jsonwebtoken` crate, HS256 default, configurable algorithms,
  symmetric round-trip with Node-issued tokens verified by shared
  fixtures
- **Cookie utilities**: identical `SameSite`, `HttpOnly`,
  `Max-Age`/`Expires`, domain scoping to Hono/Express output
- **Device info**: `woothee` or `uaparser` crate; assert identical
  parsed shape against a shared fixture matrix of UA strings
- **Session manager**: identical session lifecycle with pluggable
  storage (memory / Redis)
- **OAuth providers**: one Rust equivalent per provider in
  `src/auth/server/oauth/`. Google via `google-auth` equivalent
  (`yup-oauth2` or raw `reqwest` + google JWKS verification); generic
  OIDC via `openidconnect` crate. Redirect URIs, state handling, and
  callback payloads must match byte-for-byte on the wire.

Success criteria:

- JWT round-trip fixtures pass in both directions (TS-signed →
  Rust-verified and vice versa)
- OAuth callback flows complete against the same mock IdP from both
  servers with identical session + cookie output
- device-info parsing matches against a shared fixture matrix

### Phase 6: Stabilize and formalize server targeting

Once Rust parity is credible:

- add CI jobs that run the conformance suite against both servers
- document supported parity level
- keep TS and Rust protocol changes gated by the same compatibility tests

## Recommended Repository Shape

Do not put the Rust implementation inside the existing TypeScript package.

Prefer a sibling repository or a workspace sibling such as:

- `typeferry-rs/`

or a multi-language monorepo arrangement only if the release process is made
explicit first.

Why:

- avoids mixing Rust build concerns into the npm package immediately
- keeps publish/release concerns separate
- avoids forcing the TS package to own Cargo workflows before the protocol is
  frozen

If Rust parity becomes stable later, packaging and branding can be revisited.

## Recommended Test Architecture

The existing client should be treated as the canonical consumer.

Add a conformance harness that can target:

- local TS server
- local Rust server

The harness should not inspect server internals. It should only use:

- the published client API
- raw HTTP requests where necessary
- raw WebSocket frames where necessary

This is important because implementation-level tests can accidentally certify
"behavior that matches the current code" instead of "behavior that matches the
protocol contract."

## Highest-Risk Areas

These are the places where parity is easiest to overestimate.

### EJSON compatibility

This is the biggest protocol risk.

If the Rust implementation does not match current EJSON behavior closely
enough, the client can appear to work for primitives while failing on:

- dates
- binary payloads
- custom typed payloads
- canonicalized cache keys

The EJSON subset supported by the Rust server must be specified explicitly.

### Auth timing and state transitions

The client has assumptions around:

- initial authentication state
- auth result messages
- logout behavior
- cookie-bearing HTTP requests

Small differences here will feel like flaky reconnect bugs rather than obvious
protocol mismatches.

### Subscription semantics

`rpc:on` and `rpc:off` are not just utility methods. They define how the
realtime model behaves from the client's point of view. Room naming, protected
events, and user-scoped subscriptions all need precise parity.

### Error envelopes

The current client and tests rely on the exact shape of error vs result
payloads. "Equivalent" behavior is not enough here. The wire contract needs to
be treated as strict.

## Non-Goals

This plan does not require:

- shipping Rust immediately
- deprecating the TS server
- supporting every internal helper from day one
- replacing the authoring model for TS users
- reimplementing client-side surfaces (React, Lit, type inference)

It establishes the boundary that makes a feature-complete Rust
implementation realistic and incremental.

## Practical Recommendation

Proceed only if the project is willing to do this in the following order:

1. specification
2. conformance harness (black-box, shared with Python per
   `2026-04-20-python-server-port-and-monorepo.md`)
3. Rust HTTP parity (incl. `list:methods`, rate limiting)
4. Rust WebSocket parity
5. Rust subscription parity
6. Rust Redis parity
7. Rust authoring macros + `SchemaValidator` + `#[cached]` canonical
   keys
8. Rust auth & OAuth feature parity
9. CI gating: conformance suite must pass against TS and Rust on every
   PR; Rust server reaches `1.0.0` when the full feature parity
   checklist is green

Do not start by writing a Rust server from the current TS code informally.
Without a frozen contract and black-box compatibility tests, the effort will
drift into partial parity claims that are expensive to trust and expensive to
maintain.
