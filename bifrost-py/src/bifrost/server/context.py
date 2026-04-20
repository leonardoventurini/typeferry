"""Execution context — port of ``bifrost-ts/src/server/bifrost-async-local-storage.ts``.

The TS server wraps every method execution in
``BifrostAsyncLocalStorage.run({ executionId, context }, ...)`` so
handlers and middleware can retrieve the caller context via
``BifrostAsyncLocalStorage.getStore()``. Python's :mod:`contextvars`
provides the equivalent primitive with matching semantics across
``await`` boundaries (PROTOCOL.md §6.6).
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ExecutionContext:
    execution_id: str
    context: Any


_STORE: ContextVar[ExecutionContext | None] = ContextVar(
    "bifrost_execution_context", default=None
)


class BifrostContext:
    """Ambient store for method execution metadata (execution id + user context)."""

    @staticmethod
    def get_store() -> ExecutionContext | None:
        """Return the active :class:`ExecutionContext` or ``None`` outside a method."""

        return _STORE.get()

    @staticmethod
    @contextmanager
    def run(execution_id: str, context: Any) -> Iterator[ExecutionContext]:
        """Context manager mirroring ``AsyncLocalStorage.run``.

        Installs a fresh :class:`ExecutionContext` on the caller's
        :mod:`contextvars` context and restores the previous value on
        exit. Safe under concurrent ``asyncio`` tasks because each
        task carries its own ``contextvars.Context`` snapshot.
        """

        ctx = ExecutionContext(execution_id=execution_id, context=context)
        token = _STORE.set(ctx)
        try:
            yield ctx
        finally:
            _STORE.reset(token)
