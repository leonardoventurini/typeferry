"""``@method`` — mark a function or class method as a Bifrost RPC endpoint."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, overload

from bifrost.decorators.metadata import get_method_metadata


@overload
def method(fn_or_name: Callable[..., Any]) -> Callable[..., Any]: ...


@overload
def method(fn_or_name: str | None = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]: ...


def method(fn_or_name: Any = None) -> Any:
    """Decorator with optional wire-name override.

    ``@method`` uses the function's ``__name__`` on the wire.
    ``@method("custom.name")`` overrides the wire name.
    """

    if callable(fn_or_name):
        fn = fn_or_name
        metadata = get_method_metadata(fn)
        metadata.is_method = True
        return fn

    wire_name = fn_or_name if isinstance(fn_or_name, str) else None

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        metadata = get_method_metadata(fn)
        metadata.is_method = True
        if wire_name is not None:
            metadata.wire_name = wire_name
        return fn

    return _decorator
