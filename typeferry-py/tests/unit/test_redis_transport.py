"""RedisTransport publish + listener behavior (PROTOCOL.md §2.3).

These are unit tests that swap in a fake Redis client, so they do not
require a running Redis. Integration tests against a real server are
tracked separately under the ``integration`` directory.
"""

from __future__ import annotations

from typing import Any

import pytest

from typeferry.ejson.presentation import Presentation
from typeferry.protocol.constants import NO_CHANNEL, RedisListeners
from typeferry.server.server import Server, ServerOptions
from typeferry.server.transports.redis import RedisTransport


class FakeRedis:
    """Minimal aioredis.Redis stand-in capturing publish calls."""

    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self.deleted_keys: list[str] = []
        self.srem_calls: list[tuple[str, str]] = []
        self.sets: dict[str, set[str]] = {}

    async def publish(self, channel: str, payload: str) -> int:
        self.published.append((channel, payload))
        return 1

    async def delete(self, key: str) -> int:
        self.deleted_keys.append(key)
        return 1

    async def srem(self, key: str, *members: str) -> int:
        for m in members:
            self.srem_calls.append((key, m))
        return len(members)

    async def smembers(self, key: str) -> set[str]:
        return self.sets.get(key, set())

    async def scard(self, key: str) -> int:
        return len(self.sets.get(key, set()))

    async def aclose(self) -> None:
        pass

    async def ping(self) -> bool:
        return True


@pytest.mark.asyncio
async def test_publish_emits_expected_envelope() -> None:
    server = Server(ServerOptions())
    transport = RedisTransport(server)
    transport._pub = FakeRedis()  # type: ignore[assignment]

    await transport.publish("notif", "user:42", '{"t":"event","uuid":"x"}')

    fake: FakeRedis = transport._pub  # type: ignore[assignment]
    assert len(fake.published) == 1
    channel_name, payload = fake.published[0]
    assert channel_name == RedisListeners.EVENTS.value

    decoded = Presentation.decode(payload)
    assert decoded == {
        "event": "notif",
        "channel": "user:42",
        "message": '{"t":"event","uuid":"x"}',
    }


@pytest.mark.asyncio
async def test_publish_includes_exclude_uuid() -> None:
    server = Server(ServerOptions())
    transport = RedisTransport(server)
    transport._pub = FakeRedis()  # type: ignore[assignment]

    await transport.publish("notif", "", '{"t":"event"}', exclude_uuid="orig-1")

    fake: FakeRedis = transport._pub  # type: ignore[assignment]
    decoded = Presentation.decode(fake.published[0][1])
    assert decoded["excludeUuid"] == "orig-1"
    # Empty channel normalizes to NO_CHANNEL per TS behavior.
    assert decoded["channel"] == NO_CHANNEL


@pytest.mark.asyncio
async def test_get_stats_aggregates_across_servers() -> None:
    server = Server(ServerOptions())
    transport = RedisTransport(server)
    fake = FakeRedis()
    transport._pub = fake  # type: ignore[assignment]

    fake.sets["typeferry:servers"] = {"srv-a", "srv-b"}
    fake.sets["typeferry:clients:srv-a"] = {"c1", "c2"}
    fake.sets["typeferry:clients:srv-b"] = {"c3"}
    fake.sets["typeferry:users:srv-a"] = {"u1", "u2"}
    fake.sets["typeferry:users:srv-b"] = {"u2", "u3"}

    stats = await transport.get_stats()
    assert stats["clientCount"] == 3
    assert stats["userCount"] == 4
    assert stats["users"] == ["u1", "u2", "u3"]


@pytest.mark.asyncio
async def test_close_cleans_up_server_keys() -> None:
    server = Server(ServerOptions())
    transport = RedisTransport(server)
    fake = FakeRedis()
    transport._pub = fake  # type: ignore[assignment]
    transport._sub = FakeRedis()  # type: ignore[assignment]

    await transport.close()

    assert f"typeferry:clients:{server.uuid}" in fake.deleted_keys
    assert ("typeferry:servers", server.uuid) in fake.srem_calls
    assert transport._pub is None
    assert transport._sub is None


@pytest.mark.asyncio
async def test_listener_routes_event_to_channel_propagate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = Server(ServerOptions())
    transport = RedisTransport(server)

    observed: list[tuple[str, str, str, str | None]] = []

    async def fake_propagate(
        self: Any, event: str, payload: str, exclude_uuid: str | None = None
    ) -> None:
        observed.append((self.channel_name, event, payload, exclude_uuid))

    monkeypatch.setattr(
        "typeferry.server.server_channel.ServerChannel.propagate", fake_propagate
    )

    class FakePubSub:
        def __init__(self, items: list[dict[str, Any]]) -> None:
            self._items = items

        async def listen(self) -> Any:
            for item in self._items:
                yield item

    payload = Presentation.encode(
        {
            "event": "notif",
            "channel": "room-42",
            "message": '{"t":"event","uuid":"x"}',
            "excludeUuid": "orig",
        }
    )
    pubsub = FakePubSub([{"type": "message", "data": payload}])
    await transport._listen(pubsub)

    assert observed == [("room-42", "notif", '{"t":"event","uuid":"x"}', "orig")]
