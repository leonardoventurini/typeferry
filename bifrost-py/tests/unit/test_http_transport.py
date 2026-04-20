"""HttpTransport wire-level behavior (PROTOCOL.md §2.1)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from bifrost.ejson.presentation import Presentation
from bifrost.protocol.constants import (
    CLIENT_ID_HEADER_KEY,
    HTTP_ENDPOINT_PATH,
    TOKEN_HEADER_KEY,
)
from bifrost.protocol.messages import PayloadType
from bifrost.server.method import MethodOptions
from bifrost.server.server import AuthSetup, Server, ServerOptions
from bifrost.server.transports.http import HttpTransport
from bifrost.server.transports.rate_limit import RateLimit
from bifrost.utils.errors import Errors, PublicError


async def _post(
    client: httpx.AsyncClient, body: dict[str, Any], headers: dict[str, str] | None = None
) -> httpx.Response:
    return await client.post(
        HTTP_ENDPOINT_PATH,
        content=Presentation.encode(body),
        headers={"content-type": "text/plain", **(headers or {})},
    )


def _build(rate_limit: RateLimit | bool | None = False) -> tuple[Server, httpx.AsyncClient]:
    server = Server(ServerOptions(host="localhost", port=0))
    transport = HttpTransport(server, rate_limit=rate_limit)
    server.http_transport = transport
    return server, httpx.AsyncClient(transport=httpx.ASGITransport(transport.app), base_url="http://test")


@pytest.mark.asyncio
async def test_happy_path() -> None:
    server, client = _build()

    async def add(_node: Any, params: dict[str, int]) -> int:
        return params["a"] + params["b"]

    server.add_method("add", add)

    response = await _post(
        client,
        {"context": {}, "payload": {"method": "add", "params": {"a": 2, "b": 3}, "uuid": "call-1"}},
    )
    assert response.status_code == 200
    decoded = Presentation.decode(response.text)
    assert decoded == {
        "type": PayloadType.RESULT.value,
        "uuid": "call-1",
        "method": "add",
        "result": 5,
    }


@pytest.mark.asyncio
async def test_missing_payload_returns_invalid_request() -> None:
    _, client = _build()
    response = await _post(client, {"context": {}})
    assert response.status_code == 200
    decoded = Presentation.decode(response.text)
    assert decoded == {
        "type": PayloadType.ERROR.value,
        "message": Errors.INVALID_REQUEST.value,
    }


@pytest.mark.asyncio
async def test_method_not_found() -> None:
    _, client = _build()
    response = await _post(
        client, {"context": {}, "payload": {"method": "nope", "uuid": "u1"}}
    )
    decoded = Presentation.decode(response.text)
    assert decoded["type"] == PayloadType.ERROR.value
    assert decoded["message"] == Errors.METHOD_NOT_FOUND.value
    # METHOD_NOT_FOUND echoes the requested method, no uuid (TS parity).
    assert decoded["method"] == "nope"
    assert "uuid" not in decoded


@pytest.mark.asyncio
async def test_protected_method_without_auth_returns_method_forbidden() -> None:
    server, client = _build()

    async def secret(_node: Any, _params: Any) -> str:
        return "secret"

    server.add_method("secret", secret, MethodOptions(protected=True))

    response = await _post(
        client, {"context": {}, "payload": {"method": "secret"}}
    )
    decoded = Presentation.decode(response.text)
    assert decoded["message"] == Errors.METHOD_FORBIDDEN.value


@pytest.mark.asyncio
async def test_x_api_key_bearer_prefix_is_stripped() -> None:
    server, client = _build()

    captured: dict[str, str] = {}

    async def auth(_node: Any, context: dict[str, Any]) -> dict[str, Any]:
        captured["token"] = context["token"]
        return {"user": {"_id": "u1"}}

    async def log_in(_node: Any, _params: Any) -> bool:
        return True

    server.set_auth(AuthSetup(auth=auth, log_in=log_in))

    async def who(node: Any, _params: Any) -> str:
        return node.user_id or "anon"

    server.add_method("who", who, MethodOptions(protected=True))

    response = await _post(
        client,
        {"context": {}, "payload": {"method": "who"}},
        headers={TOKEN_HEADER_KEY: "Bearer tok-123"},
    )
    decoded = Presentation.decode(response.text)
    assert decoded["result"] == "u1"
    assert captured["token"] == "tok-123"


@pytest.mark.asyncio
async def test_x_client_id_sets_node_uuid() -> None:
    server, client = _build()

    seen: dict[str, str] = {}

    async def ident(node: Any, _params: Any) -> str:
        seen["uuid"] = node.uuid
        return node.uuid

    server.add_method("ident", ident)

    response = await _post(
        client,
        {"context": {}, "payload": {"method": "ident"}},
        headers={CLIENT_ID_HEADER_KEY: "client-abc"},
    )
    decoded = Presentation.decode(response.text)
    assert decoded["result"] == "client-abc"
    assert seen["uuid"] == "client-abc"


@pytest.mark.asyncio
async def test_public_error_passes_through() -> None:
    server, client = _build()

    async def boom(_node: Any, _params: Any) -> None:
        raise PublicError("intentional")

    server.add_method("boom", boom)

    response = await _post(
        client, {"context": {}, "payload": {"method": "boom", "uuid": "u"}}
    )
    decoded = Presentation.decode(response.text)
    assert decoded["message"] == "intentional"
    assert decoded["uuid"] == "u"


@pytest.mark.asyncio
async def test_unknown_exception_normalizes_to_internal_error() -> None:
    server, client = _build()

    async def crash(_node: Any, _params: Any) -> None:
        raise RuntimeError("never leaked")

    server.add_method("crash", crash)

    response = await _post(
        client, {"context": {}, "payload": {"method": "crash"}}
    )
    decoded = Presentation.decode(response.text)
    assert decoded["message"] == Errors.INTERNAL_ERROR.value


@pytest.mark.asyncio
async def test_schema_validation_envelopes_errors_field() -> None:
    server, client = _build()

    from bifrost.server.schema import (
        SchemaValidator,
        ValidationIssue,
        ValidationResult,
    )

    class Failing:
        def safe_parse(self, _value: Any) -> ValidationResult:
            return ValidationResult(
                success=False,
                issues=[
                    ValidationIssue(path=["a"], message="required"),
                    ValidationIssue(path=["b", "c"], message="too short"),
                ],
            )

    validator: SchemaValidator = Failing()

    async def handler(_node: Any, _params: Any) -> None:
        raise AssertionError("should not run")

    server.add_method("v", handler, MethodOptions(schema=validator))

    response = await _post(client, {"context": {}, "payload": {"method": "v"}})
    decoded = Presentation.decode(response.text)
    assert decoded["message"].startswith(Errors.INVALID_PARAMS.value)
    assert decoded["errors"] == ["a: required", "b.c: too short"]


@pytest.mark.asyncio
async def test_void_suppresses_error_response() -> None:
    server, client = _build()

    async def boom(_node: Any, _params: Any) -> None:
        raise PublicError("should not surface")

    server.add_method("boom", boom)

    response = await _post(
        client, {"context": {}, "payload": {"method": "boom", "void": True}}
    )
    assert response.status_code == 200
    assert response.text == ""


@pytest.mark.asyncio
async def test_void_does_not_suppress_success_body() -> None:
    """Per PROTOCOL.md / TS parity: void on HTTP suppresses error
    responses only — success bodies still return. Full silence is a
    WebSocket-only guarantee (rpc:void frame)."""

    server, client = _build()

    async def ok(_node: Any, _params: Any) -> str:
        return "ignored-by-caller"

    server.add_method("ok", ok)

    response = await _post(
        client, {"context": {}, "payload": {"method": "ok", "void": True}}
    )
    decoded = Presentation.decode(response.text)
    assert decoded["type"] == PayloadType.RESULT.value
    assert decoded["result"] == "ignored-by-caller"


@pytest.mark.asyncio
async def test_rate_limit_returns_429() -> None:
    server, client = _build(rate_limit=RateLimit(max=2, interval_ms=60_000))

    async def ping(_node: Any, _params: Any) -> str:
        return "pong"

    server.add_method("ping", ping)

    for _ in range(2):
        r = await _post(client, {"context": {}, "payload": {"method": "ping"}})
        assert r.status_code == 200

    blocked = await _post(client, {"context": {}, "payload": {"method": "ping"}})
    assert blocked.status_code == 429
    assert blocked.headers.get("RateLimit-Limit") == "2"
    assert blocked.headers.get("RateLimit-Remaining") == "0"


@pytest.mark.asyncio
async def test_binary_round_trip_on_wire() -> None:
    server, client = _build()

    async def echo(_node: Any, params: dict[str, bytes]) -> dict[str, bytes]:
        return {"out": params["in"]}

    server.add_method("echo", echo)

    response = await _post(
        client,
        {
            "context": {},
            "payload": {"method": "echo", "params": {"in": b"\x01\x02\x03"}},
        },
    )
    decoded = Presentation.decode(response.text)
    assert decoded["result"] == {"out": b"\x01\x02\x03"}
