# bifrost-py

Python port of the Bifrost real-time RPC framework, targeting
**server-side feature parity** with the TypeScript package
`@example-app/bifrost`.

See:

- `../PROTOCOL.md` — the normative wire-protocol spec both
  implementations track.
- `../docs/plans/2026-04-20-python-server-port-and-monorepo.md` — the
  implementation roadmap.
- `../docs/conformance/` — shared conformance fixtures (populated as
  the port progresses).

## Status

Layer-by-layer implementation is in progress. The intended layering:

1. EJSON (serialization)
2. Protocol messages (wire envelopes, constants)
3. HTTP transport
4. WebSocket transport
5. Methods, middleware, context, cache
6. Events, channels, rooms
7. Redis transport
8. Decorators / authoring surface
9. Auth & OAuth

## Running tests

```sh
cd bifrost-py
pip install -e '.[dev]'
pytest
```
