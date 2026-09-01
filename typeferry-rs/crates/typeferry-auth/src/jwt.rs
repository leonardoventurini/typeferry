use crate::types::{AccessTokenPayload, AuthConfig};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};

pub fn sign_access_token(
    payload: &AccessTokenPayload,
    config: &AuthConfig,
) -> Result<String, jsonwebtoken::errors::Error> {
    let header = Header::new(config.algorithm.as_jwt());
    encode(
        &header,
        payload,
        &EncodingKey::from_secret(config.secret.as_bytes()),
    )
}

pub fn verify_access_token(token: &str, config: &AuthConfig) -> Option<AccessTokenPayload> {
    let clean = strip_bearer(token);
    let mut validation = Validation::new(config.algorithm.as_jwt());
    validation.set_required_spec_claims(&["exp", "iat"]);
    let decoded = decode::<AccessTokenPayload>(
        clean,
        &DecodingKey::from_secret(config.secret.as_bytes()),
        &validation,
    )
    .ok()?;
    Some(decoded.claims)
}

/// Decode without verifying — inspection only. Callers MUST NOT trust.
pub fn decode_token(token: &str) -> Option<AccessTokenPayload> {
    let clean = strip_bearer(token);
    let mut validation = Validation::default();
    validation.insecure_disable_signature_validation();
    validation.validate_exp = false;
    let dummy = DecodingKey::from_secret(b"dummy");
    let decoded = decode::<AccessTokenPayload>(clean, &dummy, &validation).ok()?;
    Some(decoded.claims)
}

fn strip_bearer(token: &str) -> &str {
    if let Some(rest) = token.strip_prefix("Bearer ") {
        return rest;
    }
    if let Some(rest) = token.strip_prefix("bearer ") {
        return rest;
    }
    token
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn config() -> AuthConfig {
        AuthConfig::new("unit-test-secret-that-is-sufficiently-long")
    }

    fn payload() -> AccessTokenPayload {
        let now = Utc::now().timestamp();
        AccessTokenPayload {
            user_id: "u1".into(),
            session_id: "s1".into(),
            iat: now,
            exp: now + 900,
            claims: None,
        }
    }

    #[test]
    fn round_trip() {
        let token = sign_access_token(&payload(), &config()).unwrap();
        let decoded = verify_access_token(&token, &config()).unwrap();
        assert_eq!(decoded.user_id, "u1");
    }

    #[test]
    fn bearer_prefix_stripped() {
        let token = sign_access_token(&payload(), &config()).unwrap();
        assert!(verify_access_token(&format!("Bearer {token}"), &config()).is_some());
    }

    #[test]
    fn wrong_secret_fails() {
        let token = sign_access_token(&payload(), &config()).unwrap();
        let mut bad = config();
        bad.secret = "different-secret-that-is-also-long-enough".into();
        assert!(verify_access_token(&token, &bad).is_none());
    }

    #[test]
    fn decode_without_verification() {
        let token = sign_access_token(&payload(), &config()).unwrap();
        let claims = decode_token(&token).unwrap();
        assert_eq!(claims.user_id, "u1");
    }
}
