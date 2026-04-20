"""Google OAuth provider — port of
``bifrost-ts/src/auth/server/oauth/google.ts``.

Exchanges an authorization code for a verified user profile via the
Google Identity Platform. Uses :mod:`google.auth` for ID-token
verification; the token exchange itself is a direct HTTPS call to
Google's token endpoint so we don't force a particular HTTP client.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from bifrost.auth.oauth.types import OAuthUserProfile


@dataclass(slots=True)
class GoogleOAuthConfig:
    client_id: str
    client_secret: str
    redirect_uri: str = "postmessage"


@dataclass(slots=True)
class GoogleUser(OAuthUserProfile):
    """Typed Google-specific profile returned by :meth:`GoogleOAuthProvider.exchange_code`."""

    sub: str = ""
    hd: str | None = None
    """Hosted-domain claim; present only for Google Workspace accounts."""

    raw: dict[str, Any] = field(default_factory=dict)


class GoogleOAuthProvider:
    """Google OAuth provider — PROTOCOL.md §8.4."""

    name: str = "google"

    def __init__(self, config: GoogleOAuthConfig) -> None:
        self._config = config

    async def exchange_code(self, code: str) -> GoogleUser:
        """Exchange ``code`` for an ID token and return a verified profile."""

        tokens = await self._exchange(code)
        id_token = tokens.get("id_token")
        if not isinstance(id_token, str) or not id_token:
            raise ValueError("Google OAuth response missing id_token")

        payload = self._verify_id_token(id_token)
        return GoogleUser(
            provider="google",
            provider_id=str(payload.get("sub", "")),
            email=payload.get("email") if isinstance(payload.get("email"), str) else None,
            email_verified=bool(payload.get("email_verified")),
            name=payload.get("name") if isinstance(payload.get("name"), str) else None,
            picture=payload.get("picture") if isinstance(payload.get("picture"), str) else None,
            sub=str(payload.get("sub", "")),
            hd=payload.get("hd") if isinstance(payload.get("hd"), str) else None,
            raw=payload,
        )

    # ------------------------------------------------------------------

    async def _exchange(self, code: str) -> dict[str, Any]:
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "GoogleOAuthProvider requires 'httpx' (installed via the "
                "'dev' or 'auth' extras)"
            ) from exc

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": self._config.client_id,
                    "client_secret": self._config.client_secret,
                    "redirect_uri": self._config.redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Google OAuth returned a non-object token response")
        return data

    def _verify_id_token(self, id_token: str) -> dict[str, Any]:
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token as google_id_token
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "GoogleOAuthProvider requires 'google-auth' (install the "
                "'auth' extra)"
            ) from exc

        payload = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            self._config.client_id,
        )
        if not isinstance(payload, dict):
            raise ValueError("Google ID token verification returned a non-object payload")
        return payload
