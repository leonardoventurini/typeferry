# typeferry-rs

The Rust implementation of TypeFerry is a modular server workspace with runtime, protocol, EJSON, Axum HTTP/WebSocket, Redis, auth, and authoring-macro crates. It does not provide a browser client or UI adapter.

> [!IMPORTANT]
> These crates are not published to crates.io. The workspace sets `publish = false`; use repository path dependencies until an identity and release process are approved.

## Use the local facade crate

```toml
# Cargo.toml
[dependencies]
typeferry = { path = "../typeferry/typeferry-rs/crates/typeferry", features = ["full"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
serde_json = "1"
```

Default features include `http`, `ws`, and `macros`. Select `redis`, `auth`, or `full` only when the application needs them.

## Register methods

```rust
// src/main.rs
use std::sync::Arc;

use serde_json::Value;
use typeferry::{BoxResult, ClientNode, Server, ServerOptions};

#[typeferry::method]
async fn echo(_node: Arc<ClientNode>, params: Value) -> BoxResult {
    Ok(params)
}

#[tokio::main]
async fn main() {
    let server = Server::new(ServerOptions::default());
    typeferry::register!(server, [echo]);

    // Attach the HTTP and WebSocket routers to the application's Axum server.
}
```

The method macro requires an async handler accepting `Arc<ClientNode>` and `serde_json::Value`, returning `BoxResult`. It supports explicit wire names, protected methods, caching, and namespace registration.

## Attach transports

The runtime does not bind a socket on construction. Compose `typeferry::http::router(server.clone())` and `typeferry::ws::router(server.clone())` into the application-owned Axum router, then bind and serve it with the application's Tokio lifecycle. See [`typeferry-conformance-server`](crates/typeferry-conformance-server/src/main.rs) for an executable HTTP/WebSocket assembly.

Enable `auth` for JWT, cookie, session, device, and OAuth helpers. Authentication establishes a principal; protected handlers must still authorize tenant, role, and resource access. Reject invalid or expired credentials, restrict origins, and keep secrets out of URLs, logs, and compiled configuration.

Use the Redis feature when events must propagate between server instances. Keep application durability in a database or service of record rather than event payloads.

## Workspace crates

| Crate | Purpose |
|---|---|
| `typeferry` | Feature-gated facade and common re-exports |
| `typeferry-ejson` | Extended JSON conversion |
| `typeferry-protocol` | Wire envelopes, constants, and errors |
| `typeferry-runtime` | Methods, events, channels, rooms, context, and middleware |
| `typeferry-http` | Axum `POST /__h` transport |
| `typeferry-ws` | Axum `/typeferry-ws` transport |
| `typeferry-redis` | Multi-instance event propagation |
| `typeferry-auth` | JWT, cookies, sessions, device data, and OAuth |

## Development and verification

```sh
cd typeferry-rs
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

## Boundaries and references

- [`PROTOCOL.md`](../PROTOCOL.md) is the normative wire contract.
- [Rust runtime architecture](../docs/architecture/rust-runtime.md) explains crate boundaries.
- [Shared conformance](../docs/conformance/README.md) covers interoperability.
- The [feature-parity plan](../docs/plans/2026-04-12-rust-server-feature-parity.md) is historical, not the current API contract.
