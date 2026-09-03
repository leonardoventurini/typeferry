# TypeScript Runtime Architecture

Status: informative. Follow [`typeferry-ts/AGENTS.md`](../../typeferry-ts/AGENTS.md) for operational requirements.

## Ownership map

| Area | Primary path | Responsibility |
|---|---|---|
| Client core | `typeferry-ts/src/client/` | HTTP/WebSocket clients, calls, channels, local state |
| Server core | `typeferry-ts/src/server/` | Method dispatch, client nodes, events, rooms, middleware |
| Transports | `typeferry-ts/src/server/transports/` | Hono/Node HTTP and `ws` integration |
| Auth | `typeferry-ts/src/auth/` | Client refresh/session flow and server JWT/OAuth/cookies |
| Serialization | `typeferry-ts/src/ejson/` | EJSON conversion, equality, cloning, custom models |
| Shared utilities | `typeferry-ts/src/utils/` | Protocol shapes, constants, throttling, helpers |
| React adapter | `typeferry-ts/src/react/` | Hooks and provider over the core client |
| MongoDB extension | `typeferry-ts/src/mongodb/` | Typed collections and live invalidation over the native driver |
| Test infrastructure | `typeferry-ts/src/test/` | Shared harnesses and conformance integration |

## Runtime lifecycle

`Server` and its registered method/event primitives define application behavior. `NodeHonoTransport` owns the Hono application and Node HTTP listener. `WebSocketTransport` attaches upgrade handling to the same listener before startup. Connected peers become `ClientNode` instances used by dispatch, auth, rooms, and event routing.

Client-side `Client`, `ClientHttp`, and `ClientSocket` coordinate calls and connection state. The React surface observes or invokes that core; it must not reimplement transport, caching, or auth behavior. Other UI frameworks integrate through the framework-agnostic client instead of package-owned adapters.

Immediate connection replacement retires the active socket through
`ClientSocket` before opening its successor. Retirement rejects pending RPCs
and emits `WEBSOCKET_CLOSED` exactly once so connection-owned consumers can
discard stale work before the next authenticated `INITIALIZED` boundary.

## Contract surfaces

- `src/` may use internal organization suited to implementation.
- `dist/` and `package.json` exports are the package contract.
- ESM imports and generated declarations must resolve without consumer aliases.
- Browser consumers import compiled exports, never `node_modules/typeferry/src`.

## Testing architecture

- Unit runner: pure/local behavior and EJSON fixture coverage.
- Integration runner: server/client transports, cross-language checks, and React real-server integration.
- Browser runner: Playwright-backed browser behavior.
- `src/test/test-utility.ts`: shared high-level server/client setup.

Use focused tests near the changed runtime boundary, then run the split suites and release-surface checks required by the scoped instructions.
