# Ruby Runtime Architecture

Status: informative. Follow [`typeferry-rb/AGENTS.md`](../../typeferry-rb/AGENTS.md) for operational requirements.

## Ownership map

| Area | Primary path | Responsibility |
|---|---|---|
| EJSON and protocol | `typeferry-rb/lib/typeferry/{ejson,protocol}.rb` | Revision 1 values, encoding, and constants |
| Runtime and authoring | `typeferry-rb/lib/typeferry/{runtime,authoring}.rb` | Methods, events, rooms, clients, context, and the class DSL |
| Transports | `typeferry-rb/lib/typeferry/transports/` | Rack HTTP, Puma WebSockets, and Redis propagation |
| Authentication | `typeferry-rb/lib/typeferry/auth/` | JWTs, cookies, sessions, device information, and Google OAuth |
| Static types | `typeferry-rb/sig/` | RBS public contracts checked by Steep |
| Verification | `typeferry-rb/test/` | Unit, shared-fixture, and real-service integration tests |

## Runtime boundary

`require "typeferry"` loads only the core runtime. Applications explicitly
require Rack HTTP, Rack WebSocket, Redis, authentication, or OAuth adapters.
The first WebSocket host is certified with Puma 7 over Rack hijacking and
HTTP/1.1. Async/Falcon and HTTP/2 WebSockets are not currently supported.

The runtime is thread-safe at its shared collections. It snapshots recipients
before invoking application or socket code, keeps execution context scoped,
serializes connection writes, and owns explicit shutdown for WebSocket and
Redis workers.

## Deployment shape

Mount `RackHTTP` and `RackWebSocket` in one Rack application, run it with Puma,
and call each adapter's `close` method during shutdown. Multi-process event
delivery requires one connected `RedisTransport` per server process. The
in-memory session manager is suitable only when sessions do not need to survive
process boundaries; production clusters should implement the same public
session interface over shared durable storage.

See [`examples/rack_app.ru`](../../typeferry-rb/examples/rack_app.ru) for an
executable public-API example.
