"""Constants MUST match the TS enum values verbatim (PROTOCOL.md §12)."""

from __future__ import annotations

from bifrost.protocol import (
    BIFROST_WS_PATH,
    CLIENT_ID_HEADER_KEY,
    HTTP_ENDPOINT_PATH,
    NO_CHANNEL,
    TOKEN_HEADER_KEY,
    BifrostEvents,
    ClientEvents,
    MessageType,
    Methods,
    PayloadType,
    RedisListeners,
    ServerEvents,
    WebSocketEvents,
    WebSocketState,
)


def test_endpoint_paths() -> None:
    assert HTTP_ENDPOINT_PATH == "/__h"
    assert BIFROST_WS_PATH == "/bifrost-ws"


def test_header_keys_and_channel_sentinel() -> None:
    assert CLIENT_ID_HEADER_KEY == "x-client-id"
    assert TOKEN_HEADER_KEY == "x-api-key"
    assert NO_CHANNEL == "NO_CHANNEL"


def test_message_type_values() -> None:
    assert MessageType.RPC.value == "rpc"
    assert MessageType.RPC_VOID.value == "rpc:void"
    assert MessageType.RPC_RESPONSE.value == "rpc:res"
    assert MessageType.EVENT.value == "event"
    assert MessageType.AUTH.value == "auth"
    assert MessageType.PING.value == "ping"
    assert MessageType.PONG.value == "pong"


def test_payload_type_values() -> None:
    assert PayloadType.METHOD.value == "method"
    assert PayloadType.RESULT.value == "result"
    assert PayloadType.EVENT.value == "event"
    assert PayloadType.ERROR.value == "error"
    assert PayloadType.AUTH_RESULT.value == "auth:result"


def test_methods_enum() -> None:
    assert Methods.RPC_LOGIN.value == "rpc:login"
    assert Methods.RPC_LOGOUT.value == "rpc:logout"
    assert Methods.RPC_ON.value == "rpc:on"
    assert Methods.RPC_OFF.value == "rpc:off"
    assert Methods.LIST_METHODS.value == "list:methods"


def test_redis_listeners() -> None:
    assert RedisListeners.EVENTS.value == "events"
    assert RedisListeners.CONNECT.value == "connect"
    assert RedisListeners.MESSAGE.value == "message"


def test_websocket_state() -> None:
    assert WebSocketState.CONNECTING == 0
    assert WebSocketState.OPEN == 1
    assert WebSocketState.CLOSING == 2
    assert WebSocketState.CLOSED == 3


def test_bifrost_events_values() -> None:
    assert BifrostEvents.METHOD_REFRESH.value == "bifrost:method:refresh"
    assert (
        BifrostEvents.COMMIT_PENDING_SUBSCRIPTIONS.value
        == "commit:pending:subscriptions"
    )


def test_server_events_sampling() -> None:
    assert ServerEvents.AUTHENTICATION.value == "authentication"
    assert ServerEvents.METHOD_EXECUTION.value == "method:execution"
    assert ServerEvents.REDIS_CONNECT.value == "redis:connect"
    assert ServerEvents.DISCONNECTION.value == "disconnection"


def test_client_events_sampling() -> None:
    assert ClientEvents.LOGOUT.value == "auth:logout"
    assert ClientEvents.WEBSOCKET_CONNECTED.value == "websocket:connected"
    assert ClientEvents.CLOSE.value == "client:close"


def test_websocket_events_sampling() -> None:
    assert WebSocketEvents.OPEN.value == "open"
    assert WebSocketEvents.CLOSE.value == "close"
    assert WebSocketEvents.ERROR.value == "error"
