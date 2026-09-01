"""``@use`` — attach middleware to a method.

Middleware receives ``(node, params)`` and returns (possibly
transformed) params. Registration order is outer-to-inner — the first
``@use`` applied is the first middleware to run.

Mirrors ``typeferry-ts/src/server/decorators/use.ts``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from typeferry.decorators.metadata import get_method_metadata


def use(middleware: Callable[..., Any]) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator factory attaching a middleware step."""

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        metadata = get_method_metadata(fn)
        # Decorators are applied bottom-up in Python; the TS semantics
        # are outer-to-inner execution. We prepend here so the top
        # decorator runs first, matching TS behavior.
        metadata.middleware.insert(0, middleware)
        return fn

    return _decorator
