"""Message envelope shapes and type-guard narrowing."""

from __future__ import annotations

from bifrost.protocol import (
    AuthMessage,
    EventMessage,
    MessageType,
    PingMessage,
    PongMessage,
    RpcMessage,
    RpcResponseError,
    RpcResponseSuccess,
    RpcVoidMessage,
    is_auth_message,
    is_event_message,
    is_ping_message,
    is_pong_message,
    is_rpc_message,
    is_rpc_response,
    is_rpc_void_message,
)


def test_rpc_message_defaults() -> None:
    msg = RpcMessage(id="abc", method="users.list", params={"q": 1})
    assert msg.t is MessageType.RPC
    assert msg.id == "abc"
    assert msg.method == "users.list"
    assert msg.params == {"q": 1}


def test_rpc_void_message_defaults() -> None:
    msg = RpcVoidMessage(method="track", params=None)
    assert msg.t is MessageType.RPC_VOID
    assert msg.params is None


def test_rpc_response_success() -> None:
    msg = RpcResponseSuccess(id="abc", result={"ok": True})
    assert msg.t is MessageType.RPC_RESPONSE
    assert msg.result == {"ok": True}


def test_rpc_response_error_minimal() -> None:
    msg = RpcResponseError(id="abc", error="Method Not Found")
    assert msg.t is MessageType.RPC_RESPONSE
    assert msg.errors is None


def test_rpc_response_error_with_issues() -> None:
    msg = RpcResponseError(id="abc", error="Invalid Params", errors=["q: required"])
    assert msg.errors == ["q: required"]


def test_event_message_shape() -> None:
    msg = EventMessage(uuid="u1", event="order.created", channel="user:1", params={})
    assert msg.t is MessageType.EVENT
    assert msg.channel == "user:1"


def test_auth_and_ping_pong() -> None:
    assert AuthMessage(authenticated=True).t is MessageType.AUTH
    assert PingMessage().t is MessageType.PING
    assert PongMessage().t is MessageType.PONG


def test_type_guards_on_dicts() -> None:
    assert is_rpc_message({"t": "rpc"})
    assert is_rpc_void_message({"t": "rpc:void"})
    assert is_rpc_response({"t": "rpc:res"})
    assert is_event_message({"t": "event"})
    assert is_auth_message({"t": "auth"})
    assert is_ping_message({"t": "ping"})
    assert is_pong_message({"t": "pong"})

    # Negative cases
    assert not is_rpc_message({"t": "rpc:res"})
    assert not is_event_message({"t": "ping"})
    assert not is_rpc_message({})
    assert not is_rpc_message("not-a-dict")


def test_type_guards_on_dataclasses() -> None:
    assert is_rpc_message(RpcMessage(id="a", method="m"))
    assert is_event_message(EventMessage(uuid="u", event="e"))
    assert is_ping_message(PingMessage())
    assert not is_rpc_message(PingMessage())
