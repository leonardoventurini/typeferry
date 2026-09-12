# Ruby Package Agent Instructions

- `lib/typeferry/ejson/` owns serialization, `protocol/` owns wire constants,
  `runtime/` owns server behavior, and `transports/` owns external adapters.
- Core code must not eagerly require Rack, WebSocket, Redis, or auth gems.
- Public APIs require matching RBS signatures under `sig/`.
- Tests live under `test/unit`, `test/conformance`, and `test/integration`.
- Run `bundle exec rake verify` from this directory before substantive commits.
- Protocol-facing changes also follow `docs/runbooks/protocol-changes.md`.
