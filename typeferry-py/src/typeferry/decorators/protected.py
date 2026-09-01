"""``@protected`` / ``@public`` — auth gating at method or class level.

Mirrors ``typeferry-ts/src/server/decorators/protected.ts``. A class-level
``@protected`` sets the default for every registered method on that
class; ``@public`` at the method level opts one method out.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from typeferry.decorators.metadata import get_class_metadata, get_method_metadata

T = TypeVar("T")


def protected(obj: Any) -> Any:
    """Apply to a class (all methods protected) or a single method."""

    if isinstance(obj, type):
        class_meta = get_class_metadata(obj)
        class_meta.protected_default = True
        return obj

    if callable(obj):
        method_meta = get_method_metadata(obj)
        method_meta.protected = True
        return obj

    raise TypeError("@protected expects a class or callable")


def public(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Opt a method out of a class-level ``@protected`` default."""

    metadata = get_method_metadata(fn)
    metadata.public = True
    metadata.protected = False
    return fn
