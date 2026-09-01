"""``register(server, instance_or_class)`` — consume decorator metadata
and register every ``@method``-marked member.

Mirrors ``typeferry-ts/src/server/decorators/register.ts``.
"""

from __future__ import annotations

import inspect
from typing import TYPE_CHECKING, Any

from typeferry.decorators.metadata import (
    MethodMetadata,
    get_class_metadata,
)
from typeferry.server.method import MethodOptions

if TYPE_CHECKING:
    from typeferry.server.server import Server


def register(server: Server, target: Any) -> list[str]:
    """Register every ``@method``-decorated callable on ``target``.

    Accepts either a class (methods become unbound) or an instance
    (self auto-bound). Returns the wire names of registered methods.
    """

    if isinstance(target, type):
        cls = target
        instance: Any = None
    else:
        cls = type(target)
        instance = target

    class_meta = get_class_metadata(cls)
    registered: list[str] = []

    for attr_name in dir(cls):
        if attr_name.startswith("__"):
            continue
        raw = getattr(cls, attr_name, None)
        if raw is None or not callable(raw):
            continue
        meta = getattr(raw, "__typeferry_method_metadata__", None)
        if not isinstance(meta, MethodMetadata) or not meta.is_method:
            continue

        wire_name = meta.wire_name or attr_name
        if class_meta.namespace:
            wire_name = f"{class_meta.namespace}.{wire_name}"

        options = _build_options(meta, class_meta)

        if instance is not None:
            bound = getattr(instance, attr_name)
            fn = _wrap_instance_method(bound)
        else:
            fn = _wrap_unbound_method(raw)

        server.add_method(wire_name, fn, options)
        registered.append(wire_name)

    return registered


def _build_options(method_meta: MethodMetadata, class_meta: Any) -> MethodOptions:
    """Combine class-level and method-level metadata into MethodOptions."""

    # Protected: method-level wins, then class default, else False.
    if method_meta.public:
        protected = False
    elif method_meta.protected is not None:
        protected = method_meta.protected
    else:
        protected = bool(getattr(class_meta, "protected_default", False))

    # Cache: no_cache overrides; otherwise method-level wins over class default.
    if method_meta.no_cache:
        cache = False
        max_age_ms = None
    elif method_meta.cache:
        cache = True
        max_age_ms = method_meta.cache_max_age_ms
    else:
        cache = bool(getattr(class_meta, "cache_default", False))
        max_age_ms = (
            getattr(class_meta, "cache_max_age_default_ms", None) if cache else None
        )

    kwargs: dict[str, Any] = {
        "protected": protected,
        "cache": cache,
        "middleware": list(method_meta.middleware),
        "schema": method_meta.schema,
    }
    if max_age_ms is not None:
        kwargs["max_age"] = max_age_ms
    return MethodOptions(**kwargs)


def _wrap_instance_method(bound_method: Any) -> Any:
    """Wrap an instance-bound coroutine/function to match the ``(node, params)`` signature."""

    if inspect.iscoroutinefunction(bound_method):
        async def _async_entry(node: Any, params: Any) -> Any:
            return await bound_method(node, params)

        return _async_entry

    def _sync_entry(node: Any, params: Any) -> Any:
        return bound_method(node, params)

    return _sync_entry


def _wrap_unbound_method(fn: Any) -> Any:
    """Wrap an unbound class method — caller can pass an instance stub via closure.

    For class-only registration (no instance), we pass ``None`` as the
    implicit ``self`` so the handler signature remains ``(node, params)``.
    """

    if inspect.iscoroutinefunction(fn):
        async def _async_entry(node: Any, params: Any) -> Any:
            return await fn(None, node, params)

        return _async_entry

    def _sync_entry(node: Any, params: Any) -> Any:
        return fn(None, node, params)

    return _sync_entry
