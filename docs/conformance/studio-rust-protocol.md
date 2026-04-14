# Studio Rust Protocol Conformance

The TypeScript `bifrost` repo owns protocol governance for the Studio-facing
contract even while the Rust implementation still lives in the SolidScript
workspace.

Current Rust implementation shape:

- wire types: `solidscript/crates/bifrost-protocol`
- runtime mechanics: `solidscript/crates/bifrost-runtime`
- product adapter: `solidscript/crates/solidscript-server`

Current conformance assets:

- `solidscript/crates/solidscript-server/tests/fixtures/bifrost/*`
- `solidscript/crates/solidscript-server/tests/bifrost_protocol.rs`
- `solidscript/docs/reference/studio-bifrost-protocol.md`

The governance boundary is intentionally narrow: `bifrost` tracks the protocol
contract, while SolidScript owns the Studio-specific `studio.*` behavior and
server-side orchestration.
