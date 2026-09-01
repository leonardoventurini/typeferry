# typeferry-py

The Python implementation of TypeFerry provides a transport-agnostic server runtime, decorators, EJSON, protocol messages, HTTP/WebSocket/Redis integrations, authentication helpers, and shared conformance support. It does not provide a browser client or UI adapter.

> [!IMPORTANT]
> `typeferry-py` is not published to PyPI. Install it only from this repository while package identities remain disabled; see [`RELEASING.md`](../RELEASING.md).

## Local installation

Python 3.12 or newer is required. From the repository root:

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -e './typeferry-py[all]'
```

Use only the extras an application needs: `http`, `ws`, `redis`, `auth`, or `schema`. The `all` extra is convenient for evaluating the complete server surface.

## Register methods

```python
# app.py
from typing import Any

from typeferry.decorators import method, namespace, protected, register
from typeferry.server import ClientNode, Server, ServerOptions


@namespace("greeting")
class GreetingMethods:
    @method
    async def hello(
        self,
        node: ClientNode,
        params: dict[str, Any],
    ) -> dict[str, str]:
        return {"message": f"Hello, {params['name']}"}

    @protected
    @method
    async def profile(
        self,
        node: ClientNode,
        _params: None,
    ) -> dict[str, Any]:
        return {"context": node.context}


server = Server(ServerOptions(host="127.0.0.1", port=8002))
register(server, GreetingMethods())
```

The registered wire names are `greeting.hello` and `greeting.profile`. Add `@schema(...)`, `@cached(...)`, and `@use(...)` where runtime validation, caching, or middleware is required. Python annotations do not validate untrusted network data by themselves.

## Attach transports

Unlike the TypeScript server, the Python `Server` does not open a listener. An application attaches the HTTP and/or WebSocket adapters from `typeferry.server.transports` to its ASGI host. Redis is optional and propagates events among instances. Review the transport tests and [`scripts/conformance_server.py`](scripts/conformance_server.py) for executable assembly against the current APIs.

Application-owned WebSocket handshake authentication can be configured without copying credentials into a URL:

```python
from typeferry.server.transports.websocket import WebSocketTransport


async def authenticate_handshake(node, handshake):
    return await application_session_context(handshake.headers)


transport = WebSocketTransport(
    server,
    handshake_authenticator=authenticate_handshake,
)
```

The callback takes precedence over query-token auth. Rejection, exceptions, and the five-second timeout fail closed. Validate origins, keep credentials out of logs and URLs, and perform resource authorization inside protected methods.

## Development and verification

```sh
cd typeferry-py
python -m pip install -e '.[dev]'
ruff check .
mypy
pytest
```

## Boundaries and references

- Server-side protocol parity is the goal; use the TypeScript package for browser or React clients.
- [`PROTOCOL.md`](../PROTOCOL.md) is the normative wire contract.
- [Python runtime architecture](../docs/architecture/python-runtime.md) explains package internals.
- [Shared conformance](../docs/conformance/README.md) covers interoperability.
- The [implementation plan](../docs/plans/2026-04-20-python-server-port-and-monorepo.md) is historical, not the current API contract.
