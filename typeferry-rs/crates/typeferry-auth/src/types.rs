use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub enum JwtAlgorithm {
    #[default]
    HS256,
    HS384,
    HS512,
}

impl JwtAlgorithm {
    pub fn as_jwt(self) -> jsonwebtoken::Algorithm {
        match self {
            JwtAlgorithm::HS256 => jsonwebtoken::Algorithm::HS256,
            JwtAlgorithm::HS384 => jsonwebtoken::Algorithm::HS384,
            JwtAlgorithm::HS512 => jsonwebtoken::Algorithm::HS512,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub secret: String,
    pub algorithm: JwtAlgorithm,
    pub access_token_expiry_minutes: u64,
    pub refresh_token_expiry_days: u64,
    pub rotation_grace_period_seconds: u64,
}

impl AuthConfig {
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into(),
            algorithm: JwtAlgorithm::HS256,
            access_token_expiry_minutes: 15,
            refresh_token_expiry_days: 14,
            rotation_grace_period_seconds: 15,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct DeviceInfo {
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub os: Option<String>,
    pub browser: Option<String>,
    pub device_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub family_id: String,
    pub token: String,
    pub expiration: u64,
    pub device_info: Option<DeviceInfo>,
    pub is_revoked: bool,
    pub replaced_by: Option<String>,
    pub used_at: Option<u128>,
}

#[derive(Debug, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub exp: u64,
}

/// Access token claim payload.
///
/// The JSON field names use camelCase (`userId`, `sessionId`) to match
/// tokens issued by the TS / Python ports — PROTOCOL.md §8.2.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenPayload {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub iat: i64,
    pub exp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claims: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone)]
pub struct AuthContext<U = serde_json::Value> {
    pub user: U,
    pub user_id: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CookieOptions {
    pub name: String,
    pub max_age_days: u64,
    pub secure: Option<bool>,
    pub same_site: SameSite,
    pub path: String,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum SameSite {
    Strict,
    #[default]
    Lax,
    None,
}

impl SameSite {
    pub fn as_str(self) -> &'static str {
        match self {
            SameSite::Strict => "Strict",
            SameSite::Lax => "Lax",
            SameSite::None => "None",
        }
    }
}

impl CookieOptions {
    pub fn new(name: impl Into<String>, max_age_days: u64) -> Self {
        Self {
            name: name.into(),
            max_age_days,
            secure: None,
            same_site: SameSite::Lax,
            path: "/".into(),
        }
    }
}
