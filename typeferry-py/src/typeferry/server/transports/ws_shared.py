"""Shared WebSocket dispatch helpers — port of
``typeferry-ts/src/server/transports/ws-shared.ts``.

Common logic between alternate ASGI transports (Starlette, direct
ASGI, etc.). See PROTOCOL.md §2.2.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import secrets
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from typeferry.ejson.presentation import Presentation
from typeferry.protocol.constants import ServerEvents
from typeferry.protocol.messages import MessageType
from typeferry.server.socket import SocketState
from typeferry.utils.errors import Errors, PublicError, SchemaValidationError

if TYPE_CHECKING:
    from typeferry.server.client_node import ClientNode
    from typeferry.server.server import Server


AUTH_TIMEOUT_MS = 5000
MAX_UUID_LENGTH = 64
MAX_META_SIZE = 10_000
PING_INTERVAL_MS = 25_000

# Pre-encoded ping frame — avoids re-encoding on every tick.
PING_PAYLOAD = Presentation.encode({"t": MessageType.PING.value})


@dataclass(frozen=True, slots=True)
class WebSocketHandshake:
    """Framework-neutral metadata for application-owned authentication."""

    path: str
    headers: Mapping[str, str]
    query: Mapping[str, str]


type WebSocketHandshakeAuthenticator = Callable[
    [ClientNode, WebSocketHandshake], Any | Awaitable[Any]
]


_UUID_SANITIZE = re.compile(r"[^a-zA-Z0-9-]")

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RPC handling
# ---------------------------------------------------------------------------


async def handle_rpc(
    server: Server,
    node: ClientNode,
    rpc_id: str,
    method: str,
    params: Any = None,
) -> None:
    """Handle an RPC call and send the correlated response."""

    method_instance = server.get_method(method)
    if method_instance is None:
        await send_response(node, rpc_id, error=Errors.METHOD_NOT_FOUND.value)
        return
    if method_instance.is_protected and not node.authenticated:
        await send_response(node, rpc_id, error=Errors.METHOD_FORBIDDEN.value)
        return

    try:
        result = await method_instance.exec(params, node)
    except PublicError as err:
        await send_response(node, rpc_id, error=err.message)
        return
    except SchemaValidationError as err:
        server.emit_server_event(
            ServerEvents.METHOD_ERROR,
            {"error": err, "method": method, "params": params, "user_id": node.user_id},
        )
        await send_response(node, rpc_id, error=err.message, errors=err.errors)
        return
    except Exception as err:
        _log.exception("TypeFerry RPC method %s raised", method)
        server.emit_server_event(
            ServerEvents.METHOD_ERROR,
            {"error": err, "method": method, "params": params, "user_id": node.user_id},
        )
        await send_response(node, rpc_id, error=Errors.INTERNAL_ERROR.value)
        return

    await send_response(node, rpc_id, result=result)


async def handle_rpc_void(
    server: Server,
    node: ClientNode,
    method: str,
    params: Any = None,
) -> None:
    """Handle a fire-and-forget RPC; no response frame EVER leaves the server."""

    method_instance = server.get_method(method)
    if method_instance is None:
        _log.warning("Method not found for void call: %s", method)
        return
    if method_instance.is_protected and not node.authenticated:
        _log.warning("Method forbidden for void call: %s", method)
        return

    try:
        await method_instance.exec(params, node)
    except Exception as err:
        _log.exception("TypeFerry void method %s raised", method)
        server.emit_server_event(
            ServerEvents.METHOD_ERROR,
            {"error": err, "method": method, "params": params, "user_id": node.user_id},
        )


_UNSET: Any = object()


async def send_response(
    node: ClientNode,
    rpc_id: str,
    *,
    result: Any = _UNSET,
    error: str | None = None,
    errors: Any = None,
) -> None:
    """Send a correlated ``rpc:res`` frame on ``node.socket``."""

    if node.socket is None or node.socket.readyState != SocketState.OPEN:
        return

    payload: dict[str, Any] = {"t": MessageType.RPC_RESPONSE.value, "id": rpc_id}
    if error is not None:
        payload["error"] = error
        if errors is not None:
            payload["errors"] = errors
    elif result is not _UNSET:
        payload["result"] = result

    encoded = Presentation.encode(payload)
    import inspect as _inspect

    outcome = node.socket.send(encoded)
    if _inspect.isawaitable(outcome):
        await outcome


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


async def authenticate_node(
    server: Server,
    node: ClientNode,
    token: str | None,
    handshake_authenticator: WebSocketHandshakeAuthenticator | None = None,
    handshake: WebSocketHandshake | None = None,
) -> None:
    """Race the auth callback against :data:`AUTH_TIMEOUT_MS`.

    If auth is disabled or no token is provided, immediately emit
    ``{t:"auth", authenticated: false}`` matching PROTOCOL.md §2.2.2.
    """

    if handshake_authenticator is None and (not server.is_auth_enabled or not token):
        await node.emit_auth_result(False)
        return

    async def _run_auth() -> Any:
        import inspect as _inspect

        if handshake_authenticator is not None:
            metadata = handshake or WebSocketHandshake(path="", headers={}, query={})
            outcome = handshake_authenticator(node, metadata)
        else:
            fn = server.auth
            if fn is None:
                return False
            outcome = fn(node, {"token": token})
        if _inspect.isawaitable(outcome):
            return await outcome
        return outcome

    try:
        result = await asyncio.wait_for(_run_auth(), timeout=AUTH_TIMEOUT_MS / 1000)
    except (TimeoutError, Exception):
        if node.socket is not None and node.socket.readyState == SocketState.OPEN:
            await node.emit_auth_result(False)
        return

    if node.socket is None or node.socket.readyState != SocketState.OPEN:
        return

    if result:
        node.authenticated = True
        node.set_context(result if isinstance(result, dict) else {})
        server.emit_server_event(ServerEvents.AUTHENTICATION, node)

    await node.emit_auth_result(node.authenticated)


# ---------------------------------------------------------------------------
# Query parameter validators
# ---------------------------------------------------------------------------


def validate_uuid(uuid: Any) -> str:
    """Sanitize a client-supplied UUID or synthesize a fresh one."""

    if not isinstance(uuid, str) or not uuid or len(uuid) > MAX_UUID_LENGTH:
        return secrets.token_hex(16)
    cleaned = _UUID_SANITIZE.sub("", uuid)[:MAX_UUID_LENGTH]
    return cleaned or secrets.token_hex(16)


def validate_meta(meta: Any) -> dict[str, Any]:
    if not isinstance(meta, dict) or isinstance(meta, list):
        return {}
    try:
        if len(json.dumps(meta)) > MAX_META_SIZE:
            _log.warning("Meta object too large, ignoring")
            return {}
    except (TypeError, ValueError):
        return {}
    return meta


def parse_meta(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        return validate_meta(json.loads(raw))
    except (ValueError, TypeError):
        return {}
