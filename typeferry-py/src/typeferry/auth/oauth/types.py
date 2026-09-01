"""OAuth provider types — port of ``typeferry-ts/src/auth/server/oauth/types.ts``."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(slots=True)
class OAuthUserProfile:
    """Common shape every OAuth provider returns.

    Provider-specific fields are carried in :attr:`raw`.
    """

    provider: str
    provider_id: str
    email: str | None = None
    email_verified: bool = False
    name: str | None = None
    picture: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class OAuthProvider(Protocol):
    """Duck-typed OAuth provider surface."""

    name: str

    async def exchange_code(self, code: str) -> OAuthUserProfile: ...
