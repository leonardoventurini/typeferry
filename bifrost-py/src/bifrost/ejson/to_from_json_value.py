"""``to_json_value`` / ``from_json_value`` — port of TS EJSON recursion.

Mirrors:

* ``bifrost-ts/src/ejson/to-json-value.ts``
* ``bifrost-ts/src/ejson/from-json-value.ts``
* ``bifrost-ts/src/ejson/helpers/*``
* ``bifrost-ts/src/ejson/adjust-types-from-json-value.ts``

Implementation note: the TS port clones the value, then mutates it in
place via ``adjustTypesToJSONValue``. Python dicts/lists are mutable,
but a pure-functional recursion is simpler and avoids deepcopy
subtleties around custom types — we return freshly-built containers at
every level. Callers that rely on in-place adjustment MUST NOT pass
mutable structures and expect them to change.
"""

from __future__ import annotations

from typing import Any

from bifrost.ejson.converters import builtin_converters


def _try_to_json_value(item: Any) -> Any:
    """Return the JSON form of ``item`` if a converter claims it, else ``_SENTINEL``."""

    for converter in builtin_converters:
        if converter.match_object(item):
            return converter.to_json_value(item)
    return _SENTINEL


def _try_from_json_value(item: Any) -> Any:
    """Return the decoded form of ``item`` if it looks like a tag, else ``_SENTINEL``.

    Mirrors the TS ``fromJSONValueHelper`` gating: ``item`` must be an
    object (dict) with ≤2 keys and every key starting with ``$`` before
    any converter is consulted.
    """

    if not isinstance(item, dict):
        return _SENTINEL

    keys = list(item.keys())
    if len(keys) > 2 or not all(isinstance(k, str) and k.startswith("$") for k in keys):
        return _SENTINEL

    for converter in builtin_converters:
        if converter.match_json_value(item):
            return converter.from_json_value(item)
    return _SENTINEL


_SENTINEL: Any = object()


def to_json_value(item: Any) -> Any:
    """Convert a Python value into its JSON-compatible EJSON representation.

    Top-level converter match is tried first; otherwise recurse into
    containers.
    """

    changed = _try_to_json_value(item)
    if changed is not _SENTINEL:
        return changed

    if isinstance(item, dict):
        return {key: to_json_value(value) for key, value in item.items()}
    if isinstance(item, list):
        return [to_json_value(value) for value in item]
    if isinstance(item, tuple):
        # JSON has no tuple; mirror JS array behavior.
        return [to_json_value(value) for value in item]

    return item


def from_json_value(item: Any) -> Any:
    """Decode a JSON value produced by :func:`to_json_value` back to Python."""

    changed = _try_from_json_value(item)
    if changed is not _SENTINEL:
        return changed

    if isinstance(item, dict):
        return {key: from_json_value(value) for key, value in item.items()}
    if isinstance(item, list):
        return [from_json_value(value) for value in item]

    return item
