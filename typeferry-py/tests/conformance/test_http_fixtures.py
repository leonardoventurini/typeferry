"""Replay every HTTP fixture against the Starlette HTTP transport."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from tests.conformance.harness import configure_server, list_cases, load_json
from typeferry.ejson.presentation import Presentation
from typeferry.protocol.constants import HTTP_ENDPOINT_PATH
from typeferry.server.server import Server, ServerOptions
from typeferry.server.transports.http import HttpTransport


def _ids(paths: list[Path]) -> list[str]:
    return [p.stem for p in paths]


CASES = list_cases("http")


@pytest.mark.asyncio
@pytest.mark.parametrize("case_path", CASES, ids=_ids(CASES))
async def test_http_fixture(case_path: Path) -> None:
    fixture = load_json(case_path)
    setup = fixture.get("setup", {})

    server = Server(ServerOptions(host="localhost", port=0))
    transport = HttpTransport(server, rate_limit=False)
    server.http_transport = transport
    configure_server(server, setup)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(transport.app), base_url="http://test"
    ) as client:
        response = await client.post(
            HTTP_ENDPOINT_PATH,
            content=fixture["request"]["body"],
            headers=fixture["request"]["headers"],
        )

    assert response.status_code == fixture["response"]["status"], (
        f"{case_path.name}: status {response.status_code} != expected "
        f"{fixture['response']['status']}"
    )

    if "body" in fixture["response"]:
        assert response.text == fixture["response"]["body"], (
            f"{case_path.name}: body {response.text!r} != {fixture['response']['body']!r}"
        )
    elif "decoded" in fixture["response"]:
        actual = Presentation.decode(response.text)
        assert actual == fixture["response"]["decoded"], (
            f"{case_path.name}: decoded body {actual!r} != "
            f"{fixture['response']['decoded']!r}"
        )
