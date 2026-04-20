"""``Presentation.encode`` / ``Presentation.decode`` — port of
``bifrost-ts/src/utils/presentation.ts``.

Every HTTP body, WebSocket frame, and Redis message on the wire goes
through this layer. See PROTOCOL.md §3.
"""

from __future__ import annotations

import uuid as _uuid
from typing import Any

from bifrost.ejson.parse_stringify import parse, stringify


class Presentation:
    """Namespace object mirroring the TS ``Presentation`` export."""

    @staticmethod
    def encode(payload: Any) -> str:
        """Serialize ``payload`` to an EJSON-text string."""

        return stringify(payload)

    @staticmethod
    def decode(payload: str | dict[str, Any]) -> Any:
        """Decode an EJSON-text string, or unwrap ``{"data": "<ejson>"}``."""

        if isinstance(payload, str):
            return parse(payload)
        if isinstance(payload, dict) and "data" in payload:
            return parse(payload["data"])
        raise TypeError("Presentation.decode expects a string or {'data': str}")

    @staticmethod
    def uuid() -> str:
        """Generate a fresh UUIDv4 string (matches TS ``Presentation.uuid``)."""

        return str(_uuid.uuid4())
