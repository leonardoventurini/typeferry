# bifrost-py

Current release: `0.2.0`, adding optional application-owned WebSocket handshake
authentication with fail-closed precedence over query-token authentication.

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

## Application-owned WebSocket authentication

Hosts that retain authority in protected handshake metadata can configure an
optional authenticator without copying credentials into the WebSocket URL:

```python
from bifrost.server.transports.websocket import WebSocketTransport


async def authenticate_handshake(node, handshake):
    return await application_session_context(handshake.headers)


transport = WebSocketTransport(
    server,
    handshake_authenticator=authenticate_handshake,
)
```

The callback result takes precedence over token auth and uses Bifrost's existing
five-second authentication timeout. Rejection, errors, and timeout fail closed.
