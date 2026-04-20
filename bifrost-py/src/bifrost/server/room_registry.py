"""Room / subscription registry — port of ``bifrost-ts/src/server/room-registry.ts``.

Bidirectional in-memory index: room → sockets and socket → rooms.
Powers event broadcast and originator-exclusion semantics.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from bifrost.server.socket import BifrostSocket, SocketState

Sender = Callable[[BifrostSocket, str], None | Awaitable[None]]


class RoomRegistry:
    """O(1) join/leave/broadcast over WebSocket subscriptions."""

    def __init__(self) -> None:
        self._rooms: dict[str, set[BifrostSocket]] = {}
        self._socket_rooms: dict[int, tuple[BifrostSocket, set[str]]] = {}

    # ``BifrostSocket`` is a Protocol; concrete implementations may not be
    # hashable. We key the reverse index on ``id(socket)`` to avoid that
    # constraint. Membership in ``self._rooms`` sets still uses object
    # identity via Python's default hash (id-based for objects without
    # ``__hash__``), which is sufficient because we only ever compare the
    # same socket reference.

    def join(self, ws: BifrostSocket, room: str) -> None:
        """Add ``ws`` to ``room``. Idempotent."""

        members = self._rooms.setdefault(room, set())
        members.add(ws)

        entry = self._socket_rooms.get(id(ws))
        if entry is None:
            joined: set[str] = set()
            self._socket_rooms[id(ws)] = (ws, joined)
        else:
            _, joined = entry
        joined.add(room)

    def leave(self, ws: BifrostSocket, room: str) -> None:
        """Remove ``ws`` from ``room``. Prunes empty rooms and reverse index."""

        members = self._rooms.get(room)
        if members is not None:
            members.discard(ws)
            if not members:
                self._rooms.pop(room, None)

        entry = self._socket_rooms.get(id(ws))
        if entry is not None:
            _, joined = entry
            joined.discard(room)
            if not joined:
                self._socket_rooms.pop(id(ws), None)

    def leave_all(self, ws: BifrostSocket) -> None:
        """Remove ``ws`` from every room it's joined. Called on disconnect."""

        entry = self._socket_rooms.pop(id(ws), None)
        if entry is None:
            return
        _, joined = entry
        for room in joined:
            members = self._rooms.get(room)
            if members is not None:
                members.discard(ws)
                if not members:
                    self._rooms.pop(room, None)

    def broadcast(
        self,
        room: str,
        data: str,
        exclude: BifrostSocket | None = None,
        *,
        send: Sender | None = None,
    ) -> list[Any]:
        """Send ``data`` to every socket in ``room``.

        ``send`` defaults to ``ws.send(data)``. Return values from
        ``send`` (including coroutines) are collected so async callers
        can ``await asyncio.gather(*results)``.
        """

        members = self._rooms.get(room)
        if not members:
            return []

        results: list[Any] = []
        for ws in list(members):
            if ws is exclude:
                continue
            if getattr(ws, "readyState", SocketState.CLOSED) != SocketState.OPEN:
                continue
            result = (send or _default_send)(ws, data)
            if result is not None:
                results.append(result)
        return results

    def has(self, ws: BifrostSocket, room: str) -> bool:
        members = self._rooms.get(room)
        return ws in members if members is not None else False

    def get_room_size(self, room: str) -> int:
        members = self._rooms.get(room)
        return len(members) if members is not None else 0


def _default_send(ws: BifrostSocket, data: str) -> Any:
    return ws.send(data)
