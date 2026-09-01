"""RoomRegistry join/leave/broadcast + cleanup semantics."""

from __future__ import annotations

from typing import Any

from typeferry.server.room_registry import RoomRegistry
from typeferry.server.socket import SocketState


class FakeSocket:
    def __init__(self, state: int = SocketState.OPEN) -> None:
        self.readyState = state
        self.sent: list[str] = []
        self.closed = False

    def send(self, data: str) -> None:
        self.sent.append(data)

    def close(self) -> None:
        self.closed = True


def test_join_and_has() -> None:
    rooms = RoomRegistry()
    s1 = FakeSocket()
    rooms.join(s1, "room-a")
    assert rooms.has(s1, "room-a")
    assert not rooms.has(s1, "room-b")


def test_leave_cleans_up_empty_room() -> None:
    rooms = RoomRegistry()
    s1 = FakeSocket()
    rooms.join(s1, "room-a")
    rooms.leave(s1, "room-a")
    assert not rooms.has(s1, "room-a")
    assert rooms.get_room_size("room-a") == 0


def test_leave_all_removes_from_every_room() -> None:
    rooms = RoomRegistry()
    s1 = FakeSocket()
    rooms.join(s1, "a")
    rooms.join(s1, "b")
    rooms.leave_all(s1)
    assert not rooms.has(s1, "a")
    assert not rooms.has(s1, "b")


def test_broadcast_sends_to_all_open_sockets() -> None:
    rooms = RoomRegistry()
    a = FakeSocket()
    b = FakeSocket()
    closed = FakeSocket(state=SocketState.CLOSED)
    rooms.join(a, "room")
    rooms.join(b, "room")
    rooms.join(closed, "room")
    rooms.broadcast("room", "ping")
    assert a.sent == ["ping"]
    assert b.sent == ["ping"]
    assert closed.sent == []


def test_broadcast_honors_exclude() -> None:
    rooms = RoomRegistry()
    a = FakeSocket()
    b = FakeSocket()
    rooms.join(a, "room")
    rooms.join(b, "room")
    rooms.broadcast("room", "x", exclude=a)
    assert a.sent == []
    assert b.sent == ["x"]


def test_custom_sender_collects_return_values() -> None:
    rooms = RoomRegistry()
    a = FakeSocket()
    rooms.join(a, "room")

    def sender(ws: Any, data: str) -> str:
        return f"{id(ws)}:{data}"

    results = rooms.broadcast("room", "hi", send=sender)
    assert len(results) == 1
    assert results[0].endswith(":hi")


def test_get_room_size() -> None:
    rooms = RoomRegistry()
    s1 = FakeSocket()
    s2 = FakeSocket()
    assert rooms.get_room_size("x") == 0
    rooms.join(s1, "x")
    rooms.join(s2, "x")
    assert rooms.get_room_size("x") == 2
