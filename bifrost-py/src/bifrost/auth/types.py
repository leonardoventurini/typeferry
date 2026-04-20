"""Auth dataclasses — port of ``bifrost-ts/src/auth/types.ts``.

Claim names on ``AccessTokenPayload`` (``user_id`` / ``session_id`` /
``iat`` / ``exp``) are wire-critical. The TS implementation uses camel
case (``userId``, ``sessionId``); we store snake_case Python and
translate at the JWT boundary — see :func:`~bifrost.auth.jwt_utils.sign_access_token`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

DeviceType = Literal["mobile", "desktop", "tablet", "unknown"]


@dataclass(slots=True)
class DeviceInfo:
    ip: str | None = None
    user_agent: str | None = None
    os: str | None = None
    browser: str | None = None
    device_type: DeviceType | None = None


@dataclass(slots=True)
class Session:
    id: str
    user_id: str
    family_id: str
    token: str
    expiration: int
    """Unix seconds when the session expires."""

    device_info: DeviceInfo | None = None
    is_revoked: bool = False
    replaced_by: str | None = None
    used_at: float | None = None
    """Unix ms when the token was last rotated (for grace period tracking)."""


@dataclass(slots=True)
class AccessTokenPayload:
    user_id: str
    session_id: str
    iat: int
    """Issued-at, Unix seconds."""

    exp: int
    """Expiration, Unix seconds."""

    claims: dict[str, Any] | None = None


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    exp: int
    """Access token expiration, Unix seconds."""


JwtAlgorithm = Literal["HS256", "HS384", "HS512"]


@dataclass(slots=True)
class AuthConfig:
    secret: str
    algorithm: JwtAlgorithm = "HS256"
    access_token_expiry_minutes: int = 15
    refresh_token_expiry_days: int = 14
    rotation_grace_period_seconds: int = 15
    login_rate_limit: dict[str, int] | None = None
    refresh_rate_limit: dict[str, int] | None = None


@dataclass(slots=True)
class CookieOptions:
    name: str
    max_age_days: int
    secure: bool | None = None
    same_site: Literal["Strict", "Lax", "None"] = "Lax"
    path: str = "/"


@dataclass(slots=True)
class AuthContext:
    user: Any
    user_id: str
    session_id: str | None = None
    claims: dict[str, Any] = field(default_factory=dict)
