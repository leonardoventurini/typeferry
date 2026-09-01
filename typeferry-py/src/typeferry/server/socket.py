"""Framework-agnostic socket interface.

Mirrors ``TypeFerrySocket`` and ``SocketState`` from
``typeferry-ts/src/server/types.ts``. The concrete ASGI implementation
adapts Starlette's ``WebSocket`` to this protocol.
"""

from __future__ import annotations

from typing import Any, Protocol


class SocketState:
    """Numeric WebSocket ready states (mirrors JS ``WebSocket.readyState``)."""

    CONNECTING = 0
    OPEN = 1
    CLOSING = 2
    CLOSED = 3


class TypeFerrySocket(Protocol):
    """Minimal socket surface used by the server runtime.

    Concrete implementations MUST expose ``readyState`` as an int
    matching :class:`SocketState`, and ``send`` as an awaitable-or-sync
    method accepting a text frame.
    """

    readyState: int

    def send(self, data: str) -> Any: ...

    def close(self) -> Any: ...
