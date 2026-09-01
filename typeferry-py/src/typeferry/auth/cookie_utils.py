"""Cookie helpers — port of ``typeferry-ts/src/auth/server/cookie-utils.ts``.

The Set-Cookie serialization MUST match the TS output byte-for-byte so
the JS client's refresh flow works transparently with a Python server
(PROTOCOL.md §8.3).
"""

from __future__ import annotations

import os
import re
from urllib.parse import quote, unquote

from typeferry.auth.types import CookieOptions


def _default_secure() -> bool:
    return os.environ.get("NODE_ENV") == "production"


def set_refresh_token_cookie(token: str, options: CookieOptions) -> str:
    """Return the ``Set-Cookie`` header value encoding ``token``.

    Transport adapters call this helper and attach the returned string
    as a ``Set-Cookie`` response header.
    """

    max_age = options.max_age_days * 24 * 60 * 60
    secure = options.secure if options.secure is not None else _default_secure()
    same_site = options.same_site
    path = options.path

    encoded = quote(token, safe="")
    parts = [
        f"{options.name}={encoded}",
        "HttpOnly",
        f"Path={path}",
        f"Max-Age={max_age}",
        f"SameSite={same_site}",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def clear_refresh_token_cookie(
    name: str, *, secure: bool | None = None, path: str = "/"
) -> str:
    """Return a ``Set-Cookie`` header that clears the named cookie."""

    resolved_secure = secure if secure is not None else _default_secure()
    parts = [
        f"{name}=",
        "HttpOnly",
        f"Path={path}",
        "Max-Age=0",
        "SameSite=Lax",
    ]
    if resolved_secure:
        parts.append("Secure")
    return "; ".join(parts)


def get_refresh_token_from_cookie_header(
    cookie_header: str | None, cookie_name: str
) -> str | None:
    """Extract a cookie value from a raw ``Cookie:`` header.

    Returns None when the cookie is absent. URL-decodes the value to
    mirror :func:`set_refresh_token_cookie` encoding.
    """

    if not cookie_header:
        return None
    escaped = re.escape(cookie_name)
    match = re.search(rf"(?:^|;\s*){escaped}=([^;]*)", cookie_header)
    if match is None:
        return None
    value = match.group(1)
    try:
        return unquote(value)
    except Exception:
        return value
