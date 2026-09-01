# Application readiness gates and cookie policy ownership

## Context

TypeFerry opens its transport in the `Server` constructor, while applications may
register authentication, methods, and dependent services afterward. WebSocket
upgrades already honor `server.acceptConnections`, but HTTP RPC dispatch did
not, allowing early requests to observe an incomplete application. Separately,
cookie creation accepted an application `SameSite` policy while cookie clearing
always emitted `Lax`, preventing exact attribute symmetry.

ExampleApp temporarily patched TypeFerry's compiled output to gate HTTP and change
the framework cookie default to `Strict`. The readiness behavior belongs in the
framework; the stricter cookie policy belongs to the application. TypeFerry's
normative protocol, Python port, and Rust port all use a generic `Lax` default.

## Decision

- Node and Bun HTTP RPC transports return retryable HTTP 503 with
  `Retry-After: 1` while `server.acceptConnections` is false, matching the
  existing WebSocket acceptance boundary.
- Applications own when to close and open that gate around their complete
  registration and dependency-readiness sequence.
- Refresh-cookie creation and clearing both accept an optional `sameSite`
  policy and both default to `Lax`.
- ExampleApp explicitly supplies `SameSite=Strict` for every refresh-cookie set
  and clear operation rather than changing the framework-wide default.

## Rejected alternatives

- Client-only retries leave the early HTTP method-registration race externally
  visible and can exhaust before a cold process is ready.
- A late application middleware cannot reliably gate TypeFerry's already-mounted
  RPC route in every transport.
- Changing TypeFerry's default to `Strict` would silently alter other consumers
  and require a coordinated protocol revision across TypeScript, Python, and
  Rust for an application-specific policy.

## Consequences

Applications can expose one consistent readiness state across HTTP and
WebSocket RPC without delaying socket construction. A closed gate is explicitly
retryable rather than being misreported as a missing method or anonymous
session. Cookie deletion can match an application's issued cookie attributes,
while existing TypeFerry consumers and cross-language conformance retain their
current default.

The decision shipped in `typeferry-ts@0.3.4` from signed commit `2847379`.
ExampleApp consumes the registry artifact directly and carries no downstream
TypeFerry patch.
