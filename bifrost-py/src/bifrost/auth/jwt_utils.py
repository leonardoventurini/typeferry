"""JWT sign/verify/decode — port of ``bifrost-ts/src/auth/server/jwt-utils.ts``.

Uses :mod:`pyjwt`. Wire claims use camelCase (``userId``, ``sessionId``)
to match tokens issued by the TS server; the Python payload type uses
snake_case field names and this module translates at the boundary.
"""

from __future__ import annotations

import re
import time
from typing import Any

try:
    import jwt as pyjwt
except ImportError as _exc:  # pragma: no cover
    raise RuntimeError(
        "bifrost.auth.jwt_utils requires the 'auth' extra: "
        "pip install 'example-app-bifrost[auth]'"
    ) from _exc

from bifrost.auth.types import AccessTokenPayload, AuthConfig

_BEARER_RE = re.compile(r"^Bearer\s+", re.IGNORECASE)


def _payload_to_wire(payload: AccessTokenPayload) -> dict[str, Any]:
    wire: dict[str, Any] = {
        "userId": payload.user_id,
        "sessionId": payload.session_id,
        "iat": payload.iat,
        "exp": payload.exp,
    }
    if payload.claims is not None:
        wire["claims"] = payload.claims
    return wire


def _payload_from_wire(decoded: dict[str, Any]) -> AccessTokenPayload:
    return AccessTokenPayload(
        user_id=str(decoded["userId"]),
        session_id=str(decoded["sessionId"]),
        iat=int(decoded["iat"]),
        exp=int(decoded["exp"]),
        claims=decoded.get("claims") if isinstance(decoded.get("claims"), dict) else None,
    )


def sign_access_token(payload: AccessTokenPayload, config: AuthConfig) -> str:
    """Sign an access token with the configured algorithm.

    Always passes an explicit ``algorithms`` list to the verifier to
    prevent algorithm-confusion attacks (PROTOCOL.md §8.2).
    """

    wire = _payload_to_wire(payload)
    result = pyjwt.encode(wire, config.secret, algorithm=config.algorithm)
    return result if isinstance(result, str) else result.decode("utf-8")


def verify_access_token(
    token: str, config: AuthConfig
) -> AccessTokenPayload | None:
    """Verify and decode an access token; returns None on any failure."""

    try:
        clean_token = _BEARER_RE.sub("", token)
        decoded = pyjwt.decode(
            clean_token,
            config.secret,
            algorithms=[config.algorithm],
            options={"require": ["exp", "iat"]},
        )
    except Exception:
        return None

    if not isinstance(decoded, dict):
        return None

    # The TS implementation additionally enforces a ``maxAge`` via the
    # token's ``iat``; pyjwt handles ``exp`` natively, and the TS
    # maxAge (15m by default) is redundant with ``exp`` for tokens the
    # manager itself issues. Preserve the equivalent check explicitly
    # so clock-skew between signing hosts is bounded.
    iat = decoded.get("iat")
    max_age = config.access_token_expiry_minutes * 60
    if isinstance(iat, int | float) and (time.time() - iat) > max_age:
        return None

    try:
        return _payload_from_wire(decoded)
    except (KeyError, ValueError, TypeError):
        return None


def decode_token(token: str) -> AccessTokenPayload | None:
    """Decode a token WITHOUT verifying the signature.

    Intended for inspection only (e.g. reading claims on an expired
    token). Callers MUST NOT trust the contents.
    """

    try:
        clean_token = _BEARER_RE.sub("", token)
        decoded = pyjwt.decode(
            clean_token, options={"verify_signature": False, "verify_exp": False}
        )
    except Exception:
        return None

    if not isinstance(decoded, dict):
        return None

    try:
        return _payload_from_wire(decoded)
    except (KeyError, ValueError, TypeError):
        return None
