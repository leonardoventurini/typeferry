# bifrost-rs

Rust port of the Bifrost real-time RPC framework, targeting
**server-side feature parity** with `@example-app/bifrost` and
`example-app-bifrost` (Python).

See:

- `../PROTOCOL.md` — the normative wire-protocol spec this workspace
  tracks.
- `../docs/plans/2026-04-12-rust-server-feature-parity.md` — the
  implementation roadmap.
- `../docs/conformance/` — shared conformance fixtures.

## Workspace layout

| Crate | Purpose |
|-------|---------|
| `bifrost-ejson`    | EJSON serialization (Date, Binary, RegExp, NaN/Inf, escape, custom tag forms) |
| `bifrost-protocol` | Wire message envelopes, enums, constants |
| `bifrost-runtime`  | Server runtime: methods, events, channels, rooms, middleware, context |
| `bifrost-http`     | HTTP transport on `axum` (`POST /__h`) |
| `bifrost-ws`       | WebSocket transport (`/bifrost-ws`) |
| `bifrost-redis`    | Multi-instance event propagation via Redis pub/sub |
| `bifrost-auth`     | JWT, cookies, device info, sessions, OAuth |

## Running tests

```sh
cd bifrost-rs
cargo test --workspace
```
