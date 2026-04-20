"""OAuth providers — port of ``bifrost-ts/src/auth/server/oauth/*``.

Only Google is shipped today (parity with the TS repo).
"""

from bifrost.auth.oauth.google import GoogleOAuthProvider, GoogleUser

__all__ = ["GoogleOAuthProvider", "GoogleUser"]
