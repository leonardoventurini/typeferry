"""Conformance server for cross-language integration tests.

Boots a Python TypeFerry server on an OS-assigned port with a fixed set
of methods + events, then prints ``TYPEFERRY_PORT=<port>`` to stderr
before uvicorn starts serving — so TS tests can parse the port and
connect via the typeferry-ts client.

Usage::

    python3 -m scripts.conformance_server
"""

from __future__ import annotations

import asyncio
import sys
from typing import Any

import uvicorn
from starlette.applications import Starlette

from typeferry.server.method import MethodOptions
from typeferry.server.server import AuthSetup, Server, ServerOptions
from typeferry.server.transports.http import HttpTransport
from typeferry.server.transports.websocket import WebSocketTransport


async def _echo(_node: Any, params: Any) -> Any:
    return params


async def _add(_node: Any, params: dict[str, int]) -> int:
    return int(params["a"]) + int(params["b"])


async def _whoami(node: Any, _params: Any) -> str:
    return node.user_id or "anon"


async def _auth(_node: Any, context: dict[str, Any]) -> Any:
    if context.get("token") == "good-token":
        return {"user": {"_id": "u1"}}
    return False


async def _log_in(_node: Any, _params: Any) -> bool:
    return True


def build_server() -> tuple[Server, Starlette]:
    """Wire up a Server + Starlette app combining HTTP and WebSocket routes."""

    server = Server(ServerOptions(host="127.0.0.1", port=0))
    server.set_auth(AuthSetup(auth=_auth, log_in=_log_in))
    server.add_method("echo", _echo)
    server.add_method("add", _add)
    server.add_method("whoami", _whoami, MethodOptions(protected=True))
    server.add_event("ping.tick")

    ws = WebSocketTransport(server)
    http = HttpTransport(server, rate_limit=False)
    server.websocket_transport = ws
    server.http_transport = http

    # The HTTP transport's router already owns the /__h path; mount the
    # WS routes on top.
    app = Starlette(routes=[*http.app.routes, *ws.routes()])
    return server, app


async def main() -> None:
    server, app = build_server()

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=0,
        log_level="warning",
        lifespan="off",
    )
    uvi = uvicorn.Server(config)

    async def _emit_port() -> None:
        # Wait for uvicorn to bind and learn the chosen port.
        while not uvi.started:
            await asyncio.sleep(0.01)
        sockets = getattr(uvi, "servers", [])
        port: int | None = None
        for s in sockets:
            for sock in s.sockets:
                port = sock.getsockname()[1]
                break
            if port is not None:
                break
        if port is None:
            print("TYPEFERRY_PORT=?", file=sys.stderr, flush=True)
            return
        print(f"TYPEFERRY_PORT={port}", file=sys.stderr, flush=True)

    _ = server  # keep a handle; uvicorn owns the app
    await asyncio.gather(uvi.serve(), _emit_port())


if __name__ == "__main__":
    asyncio.run(main())
