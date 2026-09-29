---
status: implementing
project: typeferry
project-root: /Users/leonardo/Repositories/typeferry
created: 2026-09-29
updated: 2026-09-29
owner: server runtimes
decision:
supersedes:
superseded-by:
implementation:
  commits: []
  pull-request:
---

# Go server parity

## Outcome

Add a first-class Go server implementation of TypeFerry. A TypeScript client
must observe the same protocol behavior against Go as against the maintained
TypeScript, Python, Rust, and Ruby servers. Go applications receive typed,
idiomatic method, event, authentication, and transport APIs. The initial
consumer is [SolidScript Studio](../../solidscript/specs/2026-09-29-go-studio-backend.md),
but the library must contain no SolidScript policy or test-path dependency.

## Current evidence and authority

- `PROTOCOL.md` specifies HTTP, WebSocket, Redis, EJSON, RPC, auth, events, and
  authoring semantics. `docs/conformance/fixtures/` supplies executable wire
  cases. `typeferry-ts/src/test/conformance/` runs real client/server checks.
- `typeferry-rb/lib/typeferry/`, `typeferry-py/src/typeferry/`, and
  `typeferry-rs/crates/` show the maintained server feature set. No Go package
  or Go conformance server exists in the current checkout.
- Root `AGENTS.md` makes `PROTOCOL.md` authoritative. The former conflicting
  fixture-precedence sentence in `docs/conformance/README.md` was reconciled
  in the first implementation unit. Any future discrepancy still requires
  comparison with the TypeScript reference before changing behavior.
- The existing Ruby server plan excludes the optional TypeScript-only MongoDB
  live-view extension. That extension is outside the shared server-parity
  contract here; adding it later needs its own contract and tests.

## Scope and contracts

Go support covers the maintained server-side feature union, including:

- Lossless Presentation/EJSON values, custom types, canonical serialization,
  exact tags and errors, including binary, dates, regex, non-finite values,
  escaping, and cache-key canonicalization.
- HTTP `POST /__h` and WebSocket `/typeferry-ws` envelopes, headers, origin
  policy, token extraction, limits, default methods, method protection,
  middleware, schema validation, cached methods, connection replacement,
  ping/pong, room/channel/user events, and lifecycle cleanup.
- Optional Redis propagation; JWT, cookies, sessions and rotation, device
  metadata, Google OAuth building blocks, and application-owned handshake
  authentication with fail-closed precedence.
- Typed imperative authoring for methods/events and a Go-native declaration
  helper that resolves to the same metadata and runtime path. No macros or
  runtime reflection are required for parity.

The browser client, protocol version, wire paths, error strings, defaults, and
shared fixture formats stay unchanged. A Go client, React adapter, MongoDB
extension, additional OAuth provider, and registry publication are outside
this plan. Decide the public Go import path and API signatures during the
first implementation unit and obtain the required explicit API approval before
merging them; this spec authorizes the scope, not an unreviewed API shape.

## Design boundary

```text
PROTOCOL.md + shared fixtures
             |
       typeferry-go
  EJSON + protocol values
             |
  runtime (methods, context, events, rooms)
       /       |        \
  HTTP/WS    Redis     auth
       \       |        /
      application-owned net/http host
```

Use one `typeferry-go/` module with focused packages and a small facade.
Foundational packages must not import HTTP, WebSocket, Redis, OAuth, or an
application. Adapters implement the public wire surface and attach to an
application-owned `net/http` server; constructing the runtime must not bind a
port. Optional integrations must not be required by core imports. Contexts,
deadlines, shutdown, response headers, and errors cross explicit typed
boundaries. Do not copy a language-specific DSL or make fixtures into special
cases.

Go's [`net/http` server shutdown](https://pkg.go.dev/net/http#Server.Shutdown)
does not wait for upgraded WebSocket connections, so the WebSocket adapter
must own and close its connections explicitly. Database or application
persistence is not a TypeFerry core responsibility. Choose and pin transport
and auth dependencies only during implementation, after API review and
security/version checks.

## Test strategy, designed before implementation

1. Make a Go fixture harness that reads the shared EJSON, HTTP, WebSocket,
   and Redis cases directly. Start with a failing fixture in each category.
   Resolve prose/fixture conflicts against existing implementations, then
   correct the shared authority without changing wire behavior.
2. Add focused tests for Go-specific value ownership, typed registration,
   concurrent clients, reconnect replacement, ordered event delivery, rate
   limits, cancellation, shutdown, validation errors, and auth failure paths.
   Use generated values and local mock OAuth/Redis services where practical.
3. Add a Go conformance server to the existing TypeScript cross-language
   harness. Exercise real HTTP and WebSocket calls, authentication, events,
   reconnect, and error paths with the unchanged TypeScript client.
4. Run the Go race detector and bounded fuzz/property checks for EJSON,
   malformed frames, parser limits, and concurrent lifecycle behavior.
5. Add Go CI for formatting, vet/static checks, race-aware tests, fixtures,
   Redis integration, cross-language tests, and a consumer build. CI must run
   only tests tracked by this repository.

The baseline is the current TypeScript client and existing server behavior.
No claim of parity follows from fixture tests alone: real transport and
feature tests must cover behavior the frozen fixtures do not express.

## Execution units and gates

1. **Contract inventory.** Reconcile protocol/fixture authority; create a
   clause-to-test parity matrix covering the maintained server union. Record
   any actual discrepancies before selecting a Go behavior.
2. **Module and values.** Approve the public Go API/import path. Add module,
   EJSON, protocol values, exact serialization, and focused fixture tests.
3. **Runtime.** Add typed methods, context, middleware, schema, caching,
   default methods, events, rooms, user indexing, and lifecycle tests.
4. **Transports.** Add HTTP and WebSocket adapters and real TypeScript-client
   interoperability. Prove origin limits, void semantics, headers/cookies,
   reconnect, backpressure, and shutdown.
5. **Integrations.** Add optional Redis, auth/session/device/OAuth helpers,
   offline integration tests, and relevant fixture coverage.
6. **Release readiness.** Add examples, architecture and agent guidance, CI,
   package inspection, and a revision-pinned consumer path. Keep publication
   disabled until a separate release decision.

Each unit adds its tests before or alongside behavior and lands as a focused
semantic commit. The Go conformance and client-interoperability gates must be
green before SolidScript replaces its TypeFerry Ruby host.

## Acceptance criteria and verification

| Observable criterion | Planned evidence |
|---|---|
| The unchanged TypeScript client can call, authenticate, subscribe, reconnect, and receive errors from a Go server. | Real cross-language HTTP/WebSocket suite. |
| Go reproduces every applicable shared EJSON, HTTP, WebSocket, and Redis fixture without fixture-name branches. | Go fixture harness and independent TypeScript interop. |
| Maintained server features have Go behavior and typed public entry points. | Clause-to-test parity matrix plus feature/unit/integration suites. |
| Invalid origins, credentials, schemas, frames, and oversized input fail closed. | Focused negative transport/auth tests and fuzz runs. |
| Concurrent clients and server shutdown do not leak or race. | Go race detector, lifecycle tests, and bounded shutdown test. |
| Core imports do not require optional adapters, and package use is documented. | Minimal consumer build and module/package inspection. |

## Risks and recovery

EJSON ordering, WebSocket shutdown, session rotation, and Redis fanout can
appear correct in unit tests while diverging over the wire. Keep the TypeScript
client as the interoperability oracle. If parity is incomplete, leave the Go
package unpublished and keep SolidScript on its current TypeFerry revision.
An implementation-only revert does not require a protocol or data migration.

## Verification results

The Go EJSON unit passes all 15 shared fixtures and focused canonical, invalid
tag, and regex tests. The Go HTTP adapter passes all nine shared HTTP fixtures
and two real TypeScript `ClientHttp` interoperability checks. The WebSocket
adapter passes all nine shared frame fixtures, an actual HTTP upgrade and origin
gate, and two unchanged TypeScript client checks for RPC, authentication, and
event delivery. The Redis adapter passes all three shared envelope fixtures
and a two-server delivery test against a disposable Redis 7.4 container.
`go test ./...`, `go test -race ./...`, and `go vet ./...` passed from
`typeferry-go/`. Access-token signing/verification, rotating refresh sessions,
cookies, and device metadata have focused Go checks. Google code exchange and
RS256 ID-token validation pass an offline endpoint/key test, with invalid
audience, issuer, expiry, and signature cases. The implementation follows
[Google's OIDC validation requirements](https://developers.google.com/identity/openid-connect/openid-connect).
Redis presence stats, full TypeScript-client lifecycle, and complete
feature-parity criteria remain unverified. CI has not run yet.
