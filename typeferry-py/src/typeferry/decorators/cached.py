"""``@cached`` / ``@no_cache`` — memoization with canonical cache keys.

Mirrors ``typeferry-ts/src/server/decorators/cached.ts``. Cache keys are
computed via ``EJSON.stringify`` on the method params (see PROTOCOL.md
§6.3, §11.3) — semantics match the TS runtime byte-for-byte.

Default ``max_age_ms`` is 60 000.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, overload

from typeferry.decorators.metadata import get_class_metadata, get_method_metadata

DEFAULT_MAX_AGE_MS = 60_000


@overload
def cached(obj: Callable[..., Any]) -> Callable[..., Any]: ...


@overload
def cached(
    obj: type | None = None, *, max_age_ms: int = DEFAULT_MAX_AGE_MS
) -> Callable[[Any], Any]: ...


def cached(obj: Any = None, *, max_age_ms: int = DEFAULT_MAX_AGE_MS) -> Any:
    """Decorator opt-in for memoized execution.

    ``@cached`` on a class enables caching for every registered method
    with the class-level ``max_age_ms``. ``@cached(max_age_ms=...)`` on
    a method overrides both.
    """

    if obj is None:
        def _decorator_class_or_method(inner: Any) -> Any:
            if isinstance(inner, type):
                cls_meta = get_class_metadata(inner)
                cls_meta.cache_default = True
                cls_meta.cache_max_age_default_ms = max_age_ms
                return inner
            if callable(inner):
                meta = get_method_metadata(inner)
                meta.cache = True
                meta.cache_max_age_ms = max_age_ms
                return inner
            raise TypeError("@cached expects a class or callable")

        return _decorator_class_or_method

    if isinstance(obj, type):
        cls_meta = get_class_metadata(obj)
        cls_meta.cache_default = True
        cls_meta.cache_max_age_default_ms = max_age_ms
        return obj

    if callable(obj):
        meta = get_method_metadata(obj)
        meta.cache = True
        meta.cache_max_age_ms = max_age_ms
        return obj

    raise TypeError("@cached expects a class or callable")


def no_cache(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Opt a method out of a class-level ``@cached`` default."""

    meta = get_method_metadata(fn)
    meta.no_cache = True
    meta.cache = False
    return fn
