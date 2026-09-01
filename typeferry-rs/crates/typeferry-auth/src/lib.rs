//! Auth primitives — JWT, cookies, sessions.
//!
//! OAuth providers are feature-gated: enable `oauth-google` for the
//! Google provider.

pub mod cookies;
pub mod jwt;
pub mod sessions;
pub mod types;

pub use cookies::{clear_refresh_token_cookie, set_refresh_token_cookie};
pub use jwt::{decode_token, sign_access_token, verify_access_token};
pub use sessions::InMemorySessionManager;
pub use types::{
    AccessTokenPayload, AuthConfig, AuthContext, CookieOptions, DeviceInfo, JwtAlgorithm, Session,
    TokenPair,
};
