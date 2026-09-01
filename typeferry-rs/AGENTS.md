# Rust Workspace Agent Instructions

These instructions apply under `typeferry-rs/` and extend the repository root instructions.

## Scope and architecture

- The workspace implements server-side parity with TypeScript and Python.
- `typeferry-ejson` owns serialization; `typeferry-protocol` owns wire types and constants; `typeferry-runtime` owns methods, events, channels, rooms, middleware, and context.
- `typeferry-http`, `typeferry-ws`, and `typeferry-redis` are transport adapters over the runtime.
- `typeferry-auth` owns JWT, cookies, sessions, and related auth types.
- `typeferry-macros` provides compile-time authoring ergonomics; keep runtime behavior in runtime crates.
- `typeferry-conformance` loads shared fixtures, and `typeferry-conformance-server` supports cross-language tests.
- The `typeferry` facade crate should re-export stable public surfaces without duplicating implementation.

Read [docs/architecture/rust-runtime.md](../docs/architecture/rust-runtime.md) before changing crate ownership or dependency direction.

## Type and dependency contracts

- Keep inter-crate dependencies directed from adapters and facade crates toward protocol/runtime foundations; avoid cycles and convenience dependencies that collapse boundaries.
- Prefer typed errors and explicit conversions at crate boundaries. Do not replace recoverable failures with panics.
- Keep workspace dependency versions centralized where practical and update `Cargo.lock` with Cargo commands.
- Preserve `publish = false` until release identity and migration decisions explicitly change it.

## Tests and verification

Run focused crate tests first. Before handing off a substantive workspace change, run from `typeferry-rs/`:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

Protocol-facing changes also require the shared fixtures and cross-language verification described in the protocol-change runbook.
