"""Wire message envelopes — port of ``typeferry-ts/src/utils/protocol.ts``.

The ``t`` field is the discriminator. All frames travel as EJSON-encoded
text. See PROTOCOL.md §5.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, TypeGuard


class MessageType(StrEnum):
    RPC = "rpc"
    RPC_VOID = "rpc:void"
    RPC_RESPONSE = "rpc:res"
    EVENT = "event"
    AUTH = "auth"
    PING = "ping"
    PONG = "pong"


class PayloadType(StrEnum):
    """HTTP/in-memory envelope discriminator (distinct from ``MessageType``).

    Mirrors ``PayloadType`` in ``typeferry-ts/src/utils/presentation.ts``.
    Only ``RESULT`` and ``ERROR`` appear on the HTTP wire today; the
    others are reserved for in-memory client framing.
    """

    METHOD = "method"
    RESULT = "result"
    EVENT = "event"
    ERROR = "error"
    AUTH_RESULT = "auth:result"


# ---------------------------------------------------------------------------
# Client -> Server
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RpcMessage:
    id: str
    method: str
    params: Any = None
    t: MessageType = MessageType.RPC


@dataclass(frozen=True, slots=True)
class RpcVoidMessage:
    method: str
    params: Any = None
    t: MessageType = MessageType.RPC_VOID


@dataclass(frozen=True, slots=True)
class PongMessage:
    t: MessageType = MessageType.PONG


ClientMessage = RpcMessage | RpcVoidMessage | PongMessage


# ---------------------------------------------------------------------------
# Server -> Client
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RpcResponseSuccess:
    id: str
    result: Any
    t: MessageType = MessageType.RPC_RESPONSE


@dataclass(frozen=True, slots=True)
class RpcResponseError:
    id: str
    error: str
    errors: Any = None
    t: MessageType = MessageType.RPC_RESPONSE


RpcResponseMessage = RpcResponseSuccess | RpcResponseError


@dataclass(frozen=True, slots=True)
class EventMessage:
    uuid: str
    event: str
    channel: str | None = None
    params: Any = None
    t: MessageType = MessageType.EVENT


@dataclass(frozen=True, slots=True)
class AuthMessage:
    authenticated: bool
    t: MessageType = MessageType.AUTH


@dataclass(frozen=True, slots=True)
class PingMessage:
    t: MessageType = MessageType.PING


ServerMessage = RpcResponseMessage | EventMessage | AuthMessage | PingMessage
WireMessage = ClientMessage | ServerMessage


# ---------------------------------------------------------------------------
# Type guards — accept loose dicts so callers can narrow parsed envelopes
# before reaching for the dataclass constructors.
# ---------------------------------------------------------------------------


def _t_of(msg: object) -> str | None:
    if isinstance(msg, dict):
        value = msg.get("t")
        return value if isinstance(value, str) else None
    t = getattr(msg, "t", None)
    if isinstance(t, MessageType):
        return t.value
    return t if isinstance(t, str) else None


def is_rpc_message(msg: object) -> TypeGuard[dict[str, Any] | RpcMessage]:
    return _t_of(msg) == MessageType.RPC.value


def is_rpc_void_message(msg: object) -> TypeGuard[dict[str, Any] | RpcVoidMessage]:
    return _t_of(msg) == MessageType.RPC_VOID.value


def is_rpc_response(msg: object) -> TypeGuard[dict[str, Any] | RpcResponseMessage]:
    return _t_of(msg) == MessageType.RPC_RESPONSE.value


def is_event_message(msg: object) -> TypeGuard[dict[str, Any] | EventMessage]:
    return _t_of(msg) == MessageType.EVENT.value


def is_auth_message(msg: object) -> TypeGuard[dict[str, Any] | AuthMessage]:
    return _t_of(msg) == MessageType.AUTH.value


def is_ping_message(msg: object) -> TypeGuard[dict[str, Any] | PingMessage]:
    return _t_of(msg) == MessageType.PING.value


def is_pong_message(msg: object) -> TypeGuard[dict[str, Any] | PongMessage]:
    return _t_of(msg) == MessageType.PONG.value
