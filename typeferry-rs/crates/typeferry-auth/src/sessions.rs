use crate::jwt::sign_access_token;
use crate::types::{AccessTokenPayload, AuthConfig, DeviceInfo, Session, TokenPair};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

pub struct InMemorySessionManager {
    config: AuthConfig,
    sessions: Mutex<HashMap<String, Session>>,
}

impl InMemorySessionManager {
    pub fn new(config: AuthConfig) -> Self {
        Self {
            config,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn create_session(
        &self,
        user_id: &str,
        device_info: Option<DeviceInfo>,
    ) -> TokenPair {
        let token = Uuid::new_v4().to_string();
        let family_id = Uuid::new_v4().to_string();
        let session_id = Uuid::new_v4().to_string();
        let expiration =
            (Utc::now().timestamp() as u64) + self.config.refresh_token_expiry_days * 86400;

        let session = Session {
            id: session_id.clone(),
            user_id: user_id.to_string(),
            family_id,
            token: token.clone(),
            expiration,
            device_info,
            is_revoked: false,
            replaced_by: None,
            used_at: None,
        };
        self.sessions.lock().unwrap().insert(token.clone(), session);
        self.build_pair(token, user_id, &session_id)
    }

    pub async fn refresh_session(
        &self,
        refresh_token: &str,
        device_info: Option<DeviceInfo>,
    ) -> Option<TokenPair> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get(refresh_token)?.clone();
        if session.is_revoked {
            return None;
        }
        let now = Utc::now().timestamp() as u64;
        if now > session.expiration {
            return None;
        }

        // Reuse / replaced path. Track at microsecond granularity so a
        // 0-second grace window still fires for any observable reuse gap.
        if let Some(replaced) = &session.replaced_by {
            let grace_us = (self.config.rotation_grace_period_seconds as u128) * 1_000_000;
            let now_us = (Utc::now().timestamp_micros()) as u128;
            let usedat = session.used_at.unwrap_or(0);
            if now_us.saturating_sub(usedat) > grace_us {
                // Out of grace — revoke family.
                let family = session.family_id.clone();
                for s in sessions.values_mut() {
                    if s.family_id == family && !s.is_revoked {
                        s.is_revoked = true;
                    }
                }
                return None;
            }
            let replacement = sessions.get(replaced)?.clone();
            if replacement.is_revoked {
                return None;
            }
            return Some(self.build_pair(
                replacement.token.clone(),
                &replacement.user_id,
                &replacement.id,
            ));
        }

        // Rotate.
        let new_token = Uuid::new_v4().to_string();
        let new_session_id = Uuid::new_v4().to_string();
        let expiration = now + self.config.refresh_token_expiry_days * 86400;
        let new_session = Session {
            id: new_session_id.clone(),
            user_id: session.user_id.clone(),
            family_id: session.family_id.clone(),
            token: new_token.clone(),
            expiration,
            device_info,
            is_revoked: false,
            replaced_by: None,
            used_at: None,
        };
        if let Some(existing) = sessions.get_mut(refresh_token) {
            existing.replaced_by = Some(new_token.clone());
            existing.used_at = Some(Utc::now().timestamp_micros() as u128);
        }
        sessions.insert(new_token.clone(), new_session);
        Some(self.build_pair(new_token, &session.user_id, &new_session_id))
    }

    pub async fn revoke_all_user_sessions(&self, user_id: &str) -> usize {
        let mut sessions = self.sessions.lock().unwrap();
        let mut count = 0;
        for s in sessions.values_mut() {
            if s.user_id == user_id && !s.is_revoked {
                s.is_revoked = true;
                count += 1;
            }
        }
        count
    }

    fn build_pair(&self, refresh_token: String, user_id: &str, session_id: &str) -> TokenPair {
        let iat = Utc::now().timestamp();
        let exp = iat + (self.config.access_token_expiry_minutes as i64) * 60;
        let payload = AccessTokenPayload {
            user_id: user_id.to_string(),
            session_id: session_id.to_string(),
            iat,
            exp,
            claims: None,
        };
        let access_token = sign_access_token(&payload, &self.config)
            .expect("JWT signing should not fail with a valid secret");
        TokenPair {
            access_token,
            refresh_token,
            exp: exp as u64,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> AuthConfig {
        AuthConfig::new("unit-test-secret-that-is-sufficiently-long")
    }

    #[tokio::test]
    async fn create_and_refresh() {
        let m = InMemorySessionManager::new(config());
        let pair = m.create_session("u1", None).await;
        assert!(!pair.refresh_token.is_empty());
        let refreshed = m.refresh_session(&pair.refresh_token, None).await.unwrap();
        assert_ne!(refreshed.refresh_token, pair.refresh_token);
    }

    #[tokio::test]
    async fn out_of_grace_revokes_family() {
        let mut c = config();
        c.rotation_grace_period_seconds = 0;
        let m = InMemorySessionManager::new(c);
        let pair = m.create_session("u1", None).await;
        let _ = m.refresh_session(&pair.refresh_token, None).await;
        assert!(m.refresh_session(&pair.refresh_token, None).await.is_none());
    }

    #[tokio::test]
    async fn revoke_user_sessions() {
        let m = InMemorySessionManager::new(config());
        let _a = m.create_session("u1", None).await;
        let _b = m.create_session("u1", None).await;
        assert_eq!(m.revoke_all_user_sessions("u1").await, 2);
    }
}
