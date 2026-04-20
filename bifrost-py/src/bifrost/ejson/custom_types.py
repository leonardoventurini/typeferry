"""Custom-type registry — port of ``bifrost-ts/src/ejson/custom-types.ts``.

Custom EJSON types are application-defined structures that serialize
as ``{"$type": name, "$value": toJSONValue()}``. Implementations
register a factory callable via :func:`add_type` and an instance
exposes ``type_name()`` and ``to_json_value()`` methods (see
:class:`CustomType` protocol).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable

_REGISTRY: dict[str, Callable[[Any], Any]] = {}


@runtime_checkable
class CustomType(Protocol):
    """Duck-typed protocol for custom EJSON types.

    Mirrors the TS ``_isCustomType`` check:
    ``obj.toJSONValue()`` and ``obj.typeName()`` must both exist and the
    name must be registered.
    """

    def type_name(self) -> str: ...

    def to_json_value(self) -> Any: ...


def add_type(name: str, factory: Callable[[Any], Any]) -> None:
    """Register a factory for a custom type tag name.

    Raises :class:`ValueError` if the name is already registered —
    mirrors the TS ``EJSON.addType`` invariant.
    """

    if name in _REGISTRY:
        raise ValueError(f"Type {name} already present")
    _REGISTRY[name] = factory


def has_type(name: str) -> bool:
    return name in _REGISTRY


def get_factory(name: str) -> Callable[[Any], Any]:
    if name not in _REGISTRY:
        raise ValueError(f"Custom EJSON type {name} is not defined")
    return _REGISTRY[name]


def is_custom_type(obj: Any) -> bool:
    """True iff ``obj`` duck-types :class:`CustomType` and its name is registered."""

    type_name_fn = getattr(obj, "type_name", None)
    to_json_value_fn = getattr(obj, "to_json_value", None)
    if not callable(type_name_fn) or not callable(to_json_value_fn):
        return False
    try:
        name = type_name_fn()
    except Exception:
        return False
    return isinstance(name, str) and name in _REGISTRY


def _clear_registry_for_tests() -> None:
    """Test-only: reset the registry. Do NOT call in production code."""

    _REGISTRY.clear()
