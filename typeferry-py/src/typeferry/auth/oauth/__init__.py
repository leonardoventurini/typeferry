"""OAuth providers — port of ``typeferry-ts/src/auth/server/oauth/*``.

Only Google is shipped today (parity with the TS repo).
"""

from typeferry.auth.oauth.google import GoogleOAuthProvider, GoogleUser

__all__ = ["GoogleOAuthProvider", "GoogleUser"]
