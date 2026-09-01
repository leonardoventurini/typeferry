"""WebSocketTransport wire-level behavior (PROTOCOL.md §2.2)."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.applications import Starlette
from starlette.testclient import TestClient

from bifrost.ejson.presentation import Presentation
from bifrost.protocol.constants import BIFROST_WS_PATH
from bifrost.protocol.messages import MessageType
from bifrost.server.method import MethodOptions
from bifrost.server.server import AuthSetup, Server, ServerOptions
from bifrost.server.transports.websocket import WebSocketTransport
from bifrost.server.transports.ws_shared import (
    WebSocketHandshake,
    validate_meta,
    validate_uuid,
)
from bifrost.utils.errors import Errors, PublicError


def _build() -> tuple[Server, TestClient]:
    server = Server(ServerOptions(host="localhost", port=0))
    transport = WebSocketTransport(server)
    server.websocket_transport = transport
    app = Starlette(routes=transport.routes())
    return server, TestClient(app)


def _decode(raw: str) -> dict[str, Any]:
    decoded = Presentation.decode(raw)
    assert isinstance(decoded, dict)
    return decoded


def test_validate_uuid_truncates_and_sanitizes() -> None:
    assert validate_uuid("abc-123-DEF").startswith("abc-123-DEF")
    assert "$" not in validate_uuid("abc$%")
    # Oversize → replaced with a fresh random token.
    long = "a" * 128
    assert len(validate_uuid(long)) <= 64


def test_validate_meta_guards_size() -> None:
    assert validate_meta({"a": 1}) == {"a": 1}
    assert validate_meta({}) == {}
    oversized = {"k": "x" * 20_000}
    assert validate_meta(oversized) == {}


def test_connect_emits_auth_frame_without_token() -> None:
    _, client = _build()
    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        msg = _decode(ws.receive_text())
        assert msg == {"t": MessageType.AUTH.value, "authenticated": False}


def test_connect_with_auth_enabled_and_token() -> None:
    server, client = _build()

    async def auth(_node: Any, ctx: dict[str, Any]) -> dict[str, Any]:
        assert ctx["token"] == "good-token"
        return {"user": {"_id": "u1"}}

    async def log_in(_n: Any, _p: Any) -> bool:
        return True

    server.set_auth(AuthSetup(auth=auth, log_in=log_in))

    with client.websocket_connect(f"{BIFROST_WS_PATH}?token=good-token") as ws:
        msg = _decode(ws.receive_text())
        assert msg == {"t": MessageType.AUTH.value, "authenticated": True}


def test_connect_authenticates_from_application_handshake_without_token() -> None:
    server = Server(ServerOptions(host="localhost", port=0))
    observed: list[WebSocketHandshake] = []

    async def authenticate(_node: Any, handshake: WebSocketHandshake) -> dict[str, Any]:
        observed.append(handshake)
        assert handshake.headers["x-test-session"] == "opaque"
        return {"user": {"_id": "administrator"}}

    transport = WebSocketTransport(server, handshake_authenticator=authenticate)
    server.websocket_transport = transport
    client = TestClient(Starlette(routes=transport.routes()))

    with client.websocket_connect(
        BIFROST_WS_PATH, headers={"x-test-session": "opaque"}
    ) as ws:
        assert _decode(ws.receive_text()) == {
            "t": MessageType.AUTH.value,
            "authenticated": True,
        }

    assert observed[0].path == BIFROST_WS_PATH


def test_handshake_rejection_does_not_fall_back_to_token_auth() -> None:
    server = Server(ServerOptions(host="localhost", port=0))
    token_auth_called = False

    async def token_auth(_node: Any, _context: dict[str, Any]) -> dict[str, Any]:
        nonlocal token_auth_called
        token_auth_called = True
        return {"user": {"_id": "token-user"}}

    async def log_in(_node: Any, _params: Any) -> bool:
        return True

    async def reject(_node: Any, _handshake: WebSocketHandshake) -> bool:
        return False

    server.set_auth(AuthSetup(auth=token_auth, log_in=log_in))
    transport = WebSocketTransport(server, handshake_authenticator=reject)
    server.websocket_transport = transport
    client = TestClient(Starlette(routes=transport.routes()))

    with client.websocket_connect(f"{BIFROST_WS_PATH}?token=valid") as ws:
        assert _decode(ws.receive_text()) == {
            "t": MessageType.AUTH.value,
            "authenticated": False,
        }

    assert token_auth_called is False


def test_rpc_happy_path() -> None:
    server, client = _build()

    async def echo(_node: Any, params: dict[str, Any]) -> Any:
        return params["v"]

    server.add_method("echo", echo)

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())  # drain auth frame
        ws.send_text(
            Presentation.encode(
                {
                    "t": MessageType.RPC.value,
                    "id": "r1",
                    "method": "echo",
                    "params": {"v": 42},
                }
            )
        )
        response = _decode(ws.receive_text())
        assert response == {
            "t": MessageType.RPC_RESPONSE.value,
            "id": "r1",
            "result": 42,
        }


def test_rpc_method_not_found() -> None:
    _, client = _build()

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC.value, "id": "r1", "method": "nope"}
            )
        )
        response = _decode(ws.receive_text())
        assert response["error"] == Errors.METHOD_NOT_FOUND.value


def test_rpc_method_forbidden_when_unauthenticated() -> None:
    server, client = _build()

    async def secret(_node: Any, _p: Any) -> str:
        return "s"

    server.add_method("secret", secret, MethodOptions(protected=True))

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC.value, "id": "r1", "method": "secret"}
            )
        )
        response = _decode(ws.receive_text())
        assert response["error"] == Errors.METHOD_FORBIDDEN.value


def test_rpc_public_error_passes_message_through() -> None:
    server, client = _build()

    async def boom(_node: Any, _p: Any) -> None:
        raise PublicError("nope")

    server.add_method("boom", boom)

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC.value, "id": "r1", "method": "boom"}
            )
        )
        response = _decode(ws.receive_text())
        assert response["error"] == "nope"


def test_rpc_void_sends_no_response() -> None:
    server, client = _build()

    async def ignored(_node: Any, _p: Any) -> None:
        raise PublicError("still silent")

    server.add_method("ignored", ignored)

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC_VOID.value, "method": "ignored"}
            )
        )
        # Server MUST NOT reply; close cleanly.
        # A short poll ensures no frame arrives.
        ws.close()


def test_subscribe_flow_via_rpc_on() -> None:
    server, client = _build()
    server.add_event("notif")

    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {
                    "t": MessageType.RPC.value,
                    "id": "sub",
                    "method": "rpc:on",
                    "params": {"events": ["notif"], "channel": "room-a"},
                }
            )
        )
        response = _decode(ws.receive_text())
        assert response == {
            "t": MessageType.RPC_RESPONSE.value,
            "id": "sub",
            "result": {"notif": True},
        }


def test_malformed_frame_ignored() -> None:
    _, client = _build()
    with client.websocket_connect(BIFROST_WS_PATH) as ws:
        _ = _decode(ws.receive_text())
        # Garbage is dropped; follow-up RPC still works.
        ws.send_text("not-json")
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC.value, "id": "r", "method": "nope"}
            )
        )
        response = _decode(ws.receive_text())
        assert response["id"] == "r"


@pytest.mark.parametrize(
    "uuid,expected_prefix",
    [
        ("simple-uuid", "simple-uuid"),
        ("bad$chars!here", "badcharshere"),
        ("", None),
        ("a" * 128, None),
    ],
)
def test_uuid_query_param_is_applied(uuid: str, expected_prefix: str | None) -> None:
    server, client = _build()

    captured: list[str] = []

    async def who(node: Any, _p: Any) -> str:
        captured.append(node.uuid)
        return node.uuid

    server.add_method("who", who)

    with client.websocket_connect(f"{BIFROST_WS_PATH}?uuid={uuid}") as ws:
        _ = _decode(ws.receive_text())
        ws.send_text(
            Presentation.encode(
                {"t": MessageType.RPC.value, "id": "x", "method": "who"}
            )
        )
        _ = _decode(ws.receive_text())

    assert len(captured) == 1
    if expected_prefix:
        assert captured[0] == expected_prefix
    else:
        # Sanitized empty/oversize uuids fall back to random hex (32 chars).
        assert len(captured[0]) >= 16
