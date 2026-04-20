"""``@namespace`` — register a class as a namespaced method group.

Mirrors ``bifrost-ts/src/server/decorators/namespace.ts``. Methods
registered from the decorated class are named ``<prefix>.<method_name>``
(or ``<prefix>.<wire_name>`` when :func:`~bifrost.decorators.method`
overrides the method name).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from bifrost.decorators.metadata import get_class_metadata

T = TypeVar("T")


def namespace(prefix: str) -> Callable[[type[T]], type[T]]:
    """Class decorator attaching a wire-name prefix.

    .. code-block:: python

        @namespace("users")
        class UserMethods:
            @method
            async def list(self, node, params): ...  # wire name = "users.list"
    """

    def _decorator(cls: type[T]) -> type[T]:
        metadata = get_class_metadata(cls)
        metadata.namespace = prefix
        return cls

    return _decorator
