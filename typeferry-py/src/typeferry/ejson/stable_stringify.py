"""Canonical JSON output — port of ``typeferry-ts/src/ejson/stable-stringify.ts``.

Recursively sorts object keys; arrays preserve insertion order;
primitives unchanged. See PROTOCOL.md §3.3.
"""

from __future__ import annotations

import json
from typing import Any


def _sort_value(value: Any) -> Any:
    if isinstance(value, list):
        return [_sort_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _sort_value(value[key]) for key in sorted(value.keys())}
    return value


def stable_stringify(value: Any, indent: int | str | None = None) -> str:
    """Produce deterministic JSON output with recursively sorted keys.

    Matches JS ``JSON.stringify`` output conventions:

    * ``ensure_ascii=False`` — JS emits raw Unicode; Python's default
      would escape non-ASCII as ``\\uXXXX``.
    * tight separators when compact — JS produces no spaces without a
      ``space`` argument; Python's default would add them.
    * ``allow_nan=False`` — NaN/Inf MUST be tag-encoded by converters
      before reaching this function.
    """

    return json.dumps(
        _sort_value(value),
        indent=indent,
        separators=(",", ":") if indent is None else None,
        ensure_ascii=False,
        allow_nan=False,
    )
