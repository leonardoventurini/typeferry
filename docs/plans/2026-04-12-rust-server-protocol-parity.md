# Rust Server Protocol Parity Plan

## Context

Bifrost is currently a TypeScript-first RPC and realtime framework. The server
runtime lives in `src/server` and `src/auth/server`, while the browser-facing
contract is consumed by the existing JS/TS client in `src/client`.

The open architecture question is whether Bifrost should gain a pure Rust
server implementation.

The wrong scope for that effort is "full framework parity" because Bifrost's
current value includes TypeScript-native authoring ergonomics that do not
translate directly across languages:

- decorators
- inferred client types
- Zod-backed schema authoring
- React and Lit adapter ergonomics

The right scope is protocol/runtime parity.

That means a Rust server should be considered successful if the existing JS
client can talk to it without knowing or caring that the backend is no longer
the TypeScript server.

## Decision Boundary

Define the Rust goal as:

- full protocol parity with the existing Bifrost server

Do not define the goal as:

- identical internal architecture
- identical decorator APIs
- identical TypeScript authoring experience
- reimplementation of React/Lit integration

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

- identical path: `/bifrost-ws`
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
- same protected/public gating behavior
- same middleware ordering semantics
- same cache-visible semantics for cached methods
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

These are not required for the first Rust implementation:

- TypeScript decorators such as `@Namespace`, `@Method`, `@Protected`
- Zod as the schema engine
- TypeScript type inference parity
- React hooks
- Lit controllers
- Bun, Express, or Hono implementation parity
- line-by-line code structure parity

If the Rust implementation later wants its own authoring DSL or macro layer,
that should be treated as a separate project after protocol parity lands.

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
- context/token handling

This phase deliberately excludes WebSockets so the first milestone is a small,
deterministic compatibility surface.

Recommended Rust stack:

- `axum`
- `tokio`
- `serde`
- custom or ported EJSON compatibility layer

Success criteria:

- the JS client can perform HTTP method calls against the Rust server
- the conformance suite passes for HTTP-only behavior

### Phase 3: Add WebSocket protocol parity

Implement:

- `/bifrost-ws`
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

### Phase 6: Stabilize and formalize server targeting

Once Rust parity is credible:

- add CI jobs that run the conformance suite against both servers
- document supported parity level
- keep TS and Rust protocol changes gated by the same compatibility tests

## Recommended Repository Shape

Do not put the Rust implementation inside the existing TypeScript package.

Prefer a sibling repository or a workspace sibling such as:

- `Repositories/example-app/bifrost-rs`

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

## Non-Goals For The First Plan

This plan does not require:

- shipping Rust immediately
- deprecating the TS server
- supporting every internal helper from day one
- replacing the authoring model for TS users

It only establishes the boundary that makes a Rust implementation realistic.

## Practical Recommendation

Proceed only if the project is willing to do this in the following order:

1. specification
2. conformance harness
3. Rust HTTP parity
4. Rust WebSocket parity
5. Rust subscription parity
6. Rust Redis parity

Do not start by writing a Rust server from the current TS code informally.
Without a frozen contract and black-box compatibility tests, the effort will
drift into partial parity claims that are expensive to trust and expensive to
maintain.
