"""Presentation encode/decode and uuid generation."""

from __future__ import annotations

import re

import pytest

from bifrost.ejson.presentation import Presentation


def test_encode_decode_round_trip() -> None:
    value = {"hello": "world", "count": 3}
    text = Presentation.encode(value)
    assert Presentation.decode(text) == value


def test_decode_accepts_data_wrapper() -> None:
    text = Presentation.encode({"a": 1})
    assert Presentation.decode({"data": text}) == {"a": 1}


def test_decode_rejects_wrong_type() -> None:
    with pytest.raises(TypeError):
        Presentation.decode(42)  # type: ignore[arg-type]


def test_uuid_is_v4_format() -> None:
    result = Presentation.uuid()
    assert re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        result,
    )


def test_uuid_values_are_unique() -> None:
    ids = {Presentation.uuid() for _ in range(100)}
    assert len(ids) == 100
