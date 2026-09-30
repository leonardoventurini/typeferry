# Go Package Agent Instructions

- Follow `../PROTOCOL.md` and the shared fixtures in `../docs/conformance/`.
  Resolve any disagreement before changing wire behavior.
- Keep EJSON and protocol values below runtime, and keep transports, Redis,
  and auth as adapters. Core packages must not import optional integrations.
- Design focused tests before implementation. Run `go test ./...`,
  `go test -race ./...`, and `go vet ./...` from this directory before a
  substantive Go commit; include TypeScript-client interoperability when
  transport behavior changes.
- Keep public APIs typed and document non-obvious ownership, cancellation,
  and shutdown contracts.

- WebSocket method callbacks run concurrently. Preserve frame-order parsing and
  rate admission, while correlating responses by RPC ID. Callback contexts must
  be honored; handler shutdown joins callbacks and owned connection work before
  the application closes its backing services. Do not call the owning handler's
  Close from a callback it must join.
