"""Per-method metadata attached by decorators and read by ``register``.

Mirrors ``typeferry-ts/src/server/decorators/metadata.ts``. Metadata is
stored on the decorated function object via a reserved attribute so
the decorator order is irrelevant.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from typeferry.server.schema import SchemaValidator


_ATTR = "__typeferry_method_metadata__"


@dataclass(slots=True)
class MethodMetadata:
    """Metadata collected across decorators before ``register`` consumes it."""

    wire_name: str | None = None
    is_method: bool = False
    protected: bool | None = None
    public: bool = False
    cache: bool = False
    cache_max_age_ms: int | None = None
    no_cache: bool = False
    schema: SchemaValidator | None = None
    middleware: list[Callable[..., Any]] = field(default_factory=list)


def get_method_metadata(fn: Callable[..., Any]) -> MethodMetadata:
    """Return (or create) the :class:`MethodMetadata` for a function."""

    import contextlib

    metadata: MethodMetadata | None = getattr(fn, _ATTR, None)
    if metadata is None:
        metadata = MethodMetadata()
        # Some callables (e.g. bound methods on built-in types) don't
        # allow attribute assignment; fall back to returning the stub
        # the caller can discard.
        with contextlib.suppress(AttributeError, TypeError):
            setattr(fn, _ATTR, metadata)
    return metadata


_CLASS_ATTR = "__typeferry_class_metadata__"


@dataclass(slots=True)
class ClassMetadata:
    namespace: str | None = None
    protected_default: bool = False
    cache_default: bool = False
    cache_max_age_default_ms: int | None = None


def get_class_metadata(cls: type) -> ClassMetadata:
    metadata: ClassMetadata | None = getattr(cls, _CLASS_ATTR, None)
    if metadata is None:
        metadata = ClassMetadata()
        setattr(cls, _CLASS_ATTR, metadata)
    return metadata
