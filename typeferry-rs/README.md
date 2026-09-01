# typeferry-rs

Rust port of the TypeFerry real-time RPC framework, targeting
**server-side feature parity** with `typeferry-ts` and
`typeferry-py` (Python).

See:

- `../PROTOCOL.md` — the normative wire-protocol spec this workspace
  tracks.
- `../docs/plans/2026-04-12-rust-server-feature-parity.md` — the
  implementation roadmap.
- `../docs/conformance/` — shared conformance fixtures.

## Workspace layout

| Crate | Purpose |
|-------|---------|
| `typeferry-ejson`    | EJSON serialization (Date, Binary, RegExp, NaN/Inf, escape, custom tag forms) |
| `typeferry-protocol` | Wire message envelopes, enums, constants |
| `typeferry-runtime`  | Server runtime: methods, events, channels, rooms, middleware, context |
| `typeferry-http`     | HTTP transport on `axum` (`POST /__h`) |
| `typeferry-ws`       | WebSocket transport (`/typeferry-ws`) |
| `typeferry-redis`    | Multi-instance event propagation via Redis pub/sub |
| `typeferry-auth`     | JWT, cookies, device info, sessions, OAuth |

## Running tests

```sh
cd typeferry-rs
cargo test --workspace
```
