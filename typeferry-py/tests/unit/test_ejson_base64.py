"""Base64 round-trip and edge-case tests."""

from __future__ import annotations

import base64 as stdlib_b64
import secrets

import pytest

from typeferry.ejson.base64 import decode_base64, encode_base64


def test_empty_round_trip() -> None:
    assert encode_base64(b"") == ""
    assert decode_base64("") == b""


def test_short_round_trip() -> None:
    data = b"abc"
    encoded = encode_base64(data)
    assert encoded == "YWJj"
    assert decode_base64(encoded) == data


def test_padding_1_placeholder() -> None:
    encoded = encode_base64(b"ab")
    assert encoded == "YWI="
    assert decode_base64(encoded) == b"ab"


def test_padding_2_placeholders() -> None:
    encoded = encode_base64(b"a")
    assert encoded == "YQ=="
    assert decode_base64(encoded) == b"a"


def test_alphabet_match() -> None:
    data = bytes(range(256))
    encoded = encode_base64(data)
    stdlib = stdlib_b64.b64encode(data).decode("ascii")
    assert encoded == stdlib


def test_random_round_trip() -> None:
    for length in (1, 7, 8, 9, 31, 32, 33, 1024):
        data = secrets.token_bytes(length)
        encoded = encode_base64(data)
        assert decode_base64(encoded) == data


def test_url_safe_input_accepted() -> None:
    # Standard encoding of b"\xfa\xff\xf0" is "+v/w" — URL-safe is "-v_w".
    data = b"\xfa\xff\xf0"
    standard = encode_base64(data)
    assert standard == "+v/w"
    url_safe = standard.replace("+", "-").replace("/", "_")
    assert decode_base64(url_safe) == data


def test_invalid_length_rejected() -> None:
    with pytest.raises(ValueError, match="length"):
        decode_base64("abc")


def test_invalid_char_rejected() -> None:
    with pytest.raises(ValueError, match="character"):
        decode_base64("!!!!")
