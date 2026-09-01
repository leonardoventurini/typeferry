# Rust Runtime Architecture

Status: informative. Follow [`typeferry-rs/AGENTS.md`](../../typeferry-rs/AGENTS.md) for operational requirements.

## Crate ownership

| Crate | Responsibility |
|---|---|
| `typeferry-ejson` | EJSON values, converters, and presentation forms |
| `typeferry-protocol` | Wire envelopes, enums, constants, and protocol types |
| `typeferry-runtime` | Methods, events, rooms, client nodes, middleware, schema, and context |
| `typeferry-http` | Axum HTTP adapter |
| `typeferry-ws` | WebSocket adapter |
| `typeferry-redis` | Redis pub/sub propagation |
| `typeferry-auth` | JWT, cookies, sessions, and auth types |
| `typeferry-macros` | Compile-time authoring ergonomics |
| `typeferry-conformance` | Shared fixture discovery and loading |
| `typeferry-conformance-server` | Process used by cross-language integration tests |
| `typeferry` | Public facade and re-exports |

## Dependency direction

EJSON and protocol crates are foundations. The runtime composes those foundations. Transport and auth crates adapt the runtime to external systems. Macro and facade crates improve authoring without becoming alternate runtime implementations. Keep dependencies pointed in that direction and avoid cycles.

## Error and async boundaries

External input is validated at transport/protocol edges and converted into typed runtime errors. Recoverable transport, auth, and application failures should not panic. Async ownership and shutdown behavior must remain explicit so listeners, connections, and background work do not outlive the server lifecycle.

## Conformance boundary

The conformance crate reads repository-level fixtures rather than copying them. Rust-specific unit and integration tests may test ergonomics and internal invariants, while fixture tests establish shared behavior. The conformance server lets the TypeScript harness validate real HTTP and WebSocket interoperability.
