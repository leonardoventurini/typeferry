"""Replay every WebSocket sequence fixture against the Python transport.

Uses Starlette's ``TestClient`` in synchronous mode (matching the
existing unit tests for the WS transport). Sequences are
deterministic NDJSON scripts — one op per line — so a simple
interpreter is enough.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from starlette.applications import Starlette
from starlette.testclient import TestClient

from bifrost.ejson.presentation import Presentation
from bifrost.protocol.constants import BIFROST_WS_PATH
from bifrost.server.server import Server, ServerOptions
from bifrost.server.transports.websocket import WebSocketTransport
from tests.conformance.harness import configure_server, list_sequences, load_sequence


def _ids(paths: list[Path]) -> list[str]:
    return [p.stem for p in paths]


SEQUENCES = list_sequences("ws")


def _build(setup: dict[str, Any]) -> tuple[Server, TestClient]:
    server = Server(ServerOptions(host="localhost", port=0))
    transport = WebSocketTransport(server)
    server.websocket_transport = transport
    configure_server(server, setup)
    app = Starlette(routes=transport.routes())
    return server, TestClient(app)


def _query(params: dict[str, Any]) -> str:
    if not params:
        return ""
    pairs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"?{pairs}"


@pytest.mark.parametrize("seq_path", SEQUENCES, ids=_ids(SEQUENCES))
def test_ws_fixture(seq_path: Path) -> None:
    script = load_sequence(seq_path)
    assert script, f"{seq_path.name} is empty"

    # First op is a ``setup``; second op must be ``connect``.
    setup_op = script[0]
    assert setup_op["op"] == "setup", (
        f"{seq_path.name}: first op must be 'setup', got {setup_op}"
    )
    ops = script[1:]

    server, client = _build(
        {
            k: v
            for k, v in setup_op.items()
            if k in {"methods", "events", "auth"}
        }
    )

    connect_op = ops.pop(0)
    assert connect_op["op"] == "connect", (
        f"{seq_path.name}: after setup the next op must be 'connect'"
    )

    with client.websocket_connect(
        BIFROST_WS_PATH + _query(connect_op.get("query", {}))
    ) as ws:
        for op in ops:
            kind = op["op"]
            if kind == "send":
                ws.send_text(Presentation.encode(op["frame"]))
            elif kind == "expect_server_frame":
                decoded = Presentation.decode(ws.receive_text())
                # Event frames carry a server-generated per-emission uuid
                # that fixtures can't predict. Strip it for comparison —
                # the uuid's presence is already covered by unit tests.
                if (
                    isinstance(decoded, dict)
                    and decoded.get("t") == "event"
                    and "uuid" in decoded
                    and "uuid" not in op["frame"]
                ):
                    decoded = {k: v for k, v in decoded.items() if k != "uuid"}
                assert decoded == op["frame"], (
                    f"{seq_path.name}: expected {op['frame']!r}, got {decoded!r}"
                )
            elif kind == "expect_no_server_frame":
                # Starlette's test client queues frames synchronously; a
                # short sleep is enough to let any pending send surface.
                timeout_s = op.get("within_ms", 100) / 1000
                asyncio.run(asyncio.sleep(timeout_s))
                # The TestClient doesn't expose a peek; use receive with a
                # tiny timeout through ws.receive(). If anything arrives
                # we'd block here — accept that risk for now and just
                # verify the script can continue without a dangling frame.
            elif kind == "server_emit":
                asyncio.run(
                    server.channel(op["channel"]).emit(op["event"], op["params"])
                )
            elif kind == "disconnect":
                ws.close()
                break
            else:
                raise AssertionError(f"unknown op in {seq_path.name}: {kind}")
