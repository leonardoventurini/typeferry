"""Error types and the ``Errors`` enum — port of ``bifrost-ts/src/utils/errors.ts``.

String values MUST match the TS ``Errors`` enum verbatim; they travel on
the wire (PROTOCOL.md §9).
"""

from __future__ import annotations

from enum import Enum


class PublicError(Exception):
    """An intentional user-facing error. Message is sent to the client verbatim.

    Per PROTOCOL.md §9, ``PublicError`` is the only non-framework error
    whose message travels through to the client. Non-``PublicError``
    exceptions are normalized to ``Errors.INTERNAL_ERROR``.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class SchemaValidationError(Exception):
    """Raised by the validation layer; surfaces the per-issue error list.

    Serializes to the wire as ``{ error: message, errors: [...] }`` in
    both HTTP and WS envelopes.
    """

    def __init__(self, message: str, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors: list[str] = errors or []


class Errors(str, Enum):
    AUTHENTICATION_FAILED = "Authentication Failed"
    EVENT_FORBIDDEN = "Event Forbidden"
    EVENT_NOT_FOUND = "Event Not Found"
    EVENT_NOT_PROVIDED = "Event Not Provided"
    EVENT_NOT_SUBSCRIBED = "Event Not Subscribed"
    INTERNAL_ERROR = "Internal Error"
    INVALID_METHOD_NAME = "Invalid Method Name"
    INVALID_PARAMS = "Invalid Params"
    INVALID_REQUEST = "Invalid Request"
    INVALID_TOKEN = "Invalid Token"
    METHOD_FORBIDDEN = "Method Forbidden"
    METHOD_NOT_FOUND = "Method Not Found"
    METHOD_NOT_SPECIFIED = "Method Not Specified"
    PARAMS_NOT_FOUND = "Params Not Found"
    PARSE_ERROR = "Parse Error"
    SUBSCRIPTION_ERROR = "Subscription Error"
    RATE_LIMIT_EXCEEDED = "Rate Limit Exceeded"
