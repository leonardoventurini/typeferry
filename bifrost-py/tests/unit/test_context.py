"""BifrostContext — contextvars-backed execution store."""

from __future__ import annotations

import asyncio

import pytest

from bifrost.server.context import BifrostContext


def test_outside_context_returns_none() -> None:
    assert BifrostContext.get_store() is None


def test_context_manager_installs_and_restores() -> None:
    assert BifrostContext.get_store() is None
    with BifrostContext.run("exec-1", {"user": "alice"}) as ctx:
        assert BifrostContext.get_store() is ctx
        assert ctx.execution_id == "exec-1"
        assert ctx.context == {"user": "alice"}
    assert BifrostContext.get_store() is None


def test_nested_contexts_stack() -> None:
    with BifrostContext.run("outer", 1):
        outer = BifrostContext.get_store()
        assert outer is not None
        with BifrostContext.run("inner", 2):
            inner = BifrostContext.get_store()
            assert inner is not None
            assert inner.execution_id == "inner"
        after = BifrostContext.get_store()
        assert after is not None
        assert after.execution_id == "outer"


@pytest.mark.asyncio
async def test_context_survives_await_boundary() -> None:
    async def nested() -> str | None:
        await asyncio.sleep(0)
        store = BifrostContext.get_store()
        return store.execution_id if store is not None else None

    with BifrostContext.run("exec-async", {}):
        result = await nested()
    assert result == "exec-async"


@pytest.mark.asyncio
async def test_concurrent_tasks_have_independent_contexts() -> None:
    async def runner(label: str) -> str | None:
        with BifrostContext.run(label, None):
            await asyncio.sleep(0.001)
            store = BifrostContext.get_store()
            return store.execution_id if store is not None else None

    results = await asyncio.gather(runner("a"), runner("b"), runner("c"))
    assert set(results) == {"a", "b", "c"}
