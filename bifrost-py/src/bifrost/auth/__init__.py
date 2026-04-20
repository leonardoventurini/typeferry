"""Authentication surface — JWT, cookies, device info, sessions, OAuth.

Mirrors ``bifrost-ts/src/auth/server/*``.
"""

from bifrost.auth.cookie_utils import (
    clear_refresh_token_cookie,
    get_refresh_token_from_cookie_header,
    set_refresh_token_cookie,
)
from bifrost.auth.device_info import parse_device_info
from bifrost.auth.jwt_utils import (
    decode_token,
    sign_access_token,
    verify_access_token,
)
from bifrost.auth.session_manager import InMemorySessionManager
from bifrost.auth.types import (
    AccessTokenPayload,
    AuthConfig,
    AuthContext,
    CookieOptions,
    DeviceInfo,
    Session,
    TokenPair,
)

__all__ = [
    "AccessTokenPayload",
    "AuthConfig",
    "AuthContext",
    "CookieOptions",
    "DeviceInfo",
    "InMemorySessionManager",
    "Session",
    "TokenPair",
    "clear_refresh_token_cookie",
    "decode_token",
    "get_refresh_token_from_cookie_header",
    "parse_device_info",
    "set_refresh_token_cookie",
    "sign_access_token",
    "verify_access_token",
]
