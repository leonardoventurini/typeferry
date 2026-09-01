"""EJSON — extended JSON with tagged representations for Date, RegExp,
NaN/Inf, Binary, escape wrappers, and registered custom types.

Public surface mirrors the TS ``EJSON`` namespace. See PROTOCOL.md §3.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from typeferry.ejson import custom_types
from typeferry.ejson.base64 import decode_base64, encode_base64
from typeferry.ejson.converters import EJSONRegExp, builtin_converters
from typeferry.ejson.custom_types import CustomType
from typeferry.ejson.equals import equals
from typeferry.ejson.parse_stringify import parse, stringify
from typeferry.ejson.stable_stringify import stable_stringify
from typeferry.ejson.to_from_json_value import from_json_value, to_json_value


def is_binary(obj: Any) -> bool:
    """Mirror of ``EJSON.isBinary`` — True for ``bytes`` / ``bytearray``."""

    return isinstance(obj, (bytes, bytearray))


def new_binary(length: int) -> bytearray:
    """Mirror of ``EJSON.newBinary`` — allocate a fresh mutable byte buffer."""

    return bytearray(length)


def add_type(name: str, factory: Callable[[Any], Any]) -> None:
    """Register a custom-type factory (see :mod:`typeferry.ejson.custom_types`)."""

    custom_types.add_type(name, factory)


class EJSON:
    """Namespace object mirroring the TS ``EJSON`` export.

    Equivalent Python callers may import the functional API directly; this
    class exists so code ported from TS can keep calling ``EJSON.parse``,
    ``EJSON.stringify``, etc., unchanged.
    """

    parse = staticmethod(parse)
    stringify = staticmethod(stringify)
    stable_stringify = staticmethod(stable_stringify)
    to_json_value = staticmethod(to_json_value)
    from_json_value = staticmethod(from_json_value)
    equals = staticmethod(equals)
    is_binary = staticmethod(is_binary)
    new_binary = staticmethod(new_binary)
    add_type = staticmethod(add_type)


__all__ = [
    "EJSON",
    "CustomType",
    "EJSONRegExp",
    "add_type",
    "builtin_converters",
    "decode_base64",
    "encode_base64",
    "equals",
    "from_json_value",
    "is_binary",
    "new_binary",
    "parse",
    "stable_stringify",
    "stringify",
    "to_json_value",
]
