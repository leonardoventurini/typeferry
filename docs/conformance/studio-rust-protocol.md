# Studio Rust Protocol Conformance

The TypeScript `typeferry` repo owns protocol governance for the Studio-facing
contract even while the Rust implementation still lives in the SolidScript
workspace.

Current Rust implementation shape:

- wire types: `solidscript/crates/typeferry-protocol`
- runtime mechanics: `solidscript/crates/typeferry-runtime`
- product adapter: `solidscript/crates/solidscript-server`

Current conformance assets:

- `solidscript/crates/solidscript-server/tests/fixtures/typeferry/*`
- `solidscript/crates/solidscript-server/tests/typeferry_protocol.rs`
- `solidscript/docs/reference/studio-typeferry-protocol.md`

The governance boundary is intentionally narrow: `typeferry` tracks the protocol
contract, while SolidScript owns the Studio-specific `studio.*` behavior and
server-side orchestration.
