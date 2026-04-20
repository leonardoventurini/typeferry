"""Room naming — ``bifrost:<channel>:<event>`` (PROTOCOL.md §10.1)."""

from __future__ import annotations


def get_room_name(channel: str, event_name: str) -> str:
    return f"bifrost:{channel}:{event_name}"
