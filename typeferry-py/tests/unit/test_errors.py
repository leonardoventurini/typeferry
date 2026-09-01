"""Errors enum string values (PROTOCOL.md §9) and exception shapes."""

from __future__ import annotations

import pytest

from typeferry.utils import Errors, PublicError, SchemaValidationError


def test_errors_enum_strings() -> None:
    assert Errors.AUTHENTICATION_FAILED.value == "Authentication Failed"
    assert Errors.EVENT_FORBIDDEN.value == "Event Forbidden"
    assert Errors.EVENT_NOT_FOUND.value == "Event Not Found"
    assert Errors.EVENT_NOT_PROVIDED.value == "Event Not Provided"
    assert Errors.EVENT_NOT_SUBSCRIBED.value == "Event Not Subscribed"
    assert Errors.INTERNAL_ERROR.value == "Internal Error"
    assert Errors.INVALID_METHOD_NAME.value == "Invalid Method Name"
    assert Errors.INVALID_PARAMS.value == "Invalid Params"
    assert Errors.INVALID_REQUEST.value == "Invalid Request"
    assert Errors.INVALID_TOKEN.value == "Invalid Token"
    assert Errors.METHOD_FORBIDDEN.value == "Method Forbidden"
    assert Errors.METHOD_NOT_FOUND.value == "Method Not Found"
    assert Errors.METHOD_NOT_SPECIFIED.value == "Method Not Specified"
    assert Errors.PARAMS_NOT_FOUND.value == "Params Not Found"
    assert Errors.PARSE_ERROR.value == "Parse Error"
    assert Errors.SUBSCRIPTION_ERROR.value == "Subscription Error"
    assert Errors.RATE_LIMIT_EXCEEDED.value == "Rate Limit Exceeded"


def test_public_error_message() -> None:
    err = PublicError("something public")
    assert err.message == "something public"
    assert str(err) == "something public"
    assert isinstance(err, Exception)


def test_schema_validation_error_with_and_without_issues() -> None:
    err = SchemaValidationError("Invalid Params: q: required", ["q: required"])
    assert err.message == "Invalid Params: q: required"
    assert err.errors == ["q: required"]

    err_empty = SchemaValidationError("Invalid Params")
    assert err_empty.errors == []


def test_public_error_raises() -> None:
    with pytest.raises(PublicError) as info:
        raise PublicError("bad")
    assert info.value.message == "bad"
