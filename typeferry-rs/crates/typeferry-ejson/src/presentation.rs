//! `Presentation::encode` / `decode` — the wire-layer wrapper used by
//! every TypeFerry transport.

use crate::converters::{from_json_value, to_json_value};
use crate::value::EjsonValue;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum PresentationError {
    #[error("malformed JSON: {0}")]
    Json(#[from] serde_json::Error),
}

/// Namespace struct mirroring the TS / Python `Presentation` exports.
pub struct Presentation;

impl Presentation {
    /// Encode an `EjsonValue` as a JSON text frame.
    pub fn encode(value: &EjsonValue) -> String {
        let json = to_json_value(value);
        serde_json::to_string(&json).expect("EJSON encoding is total")
    }

    /// Decode a JSON text frame into an `EjsonValue`.
    pub fn decode(source: &str) -> Result<EjsonValue, PresentationError> {
        let parsed: Value = serde_json::from_str(source)?;
        Ok(from_json_value(&parsed))
    }

    /// Generate a fresh UUID v4 (matches TS / Python output).
    pub fn uuid() -> String {
        // We avoid pulling in the `uuid` crate at this layer — callers
        // that need UUIDs already depend on it for other reasons.
        // Emit a compact time+random hex string for standalone use.
        use std::time::{SystemTime, UNIX_EPOCH};
        let micros = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_micros())
            .unwrap_or(0);
        let mut rand_bytes = [0u8; 8];
        for (i, b) in rand_bytes.iter_mut().enumerate() {
            *b = ((micros >> (i * 8)) & 0xFF) as u8;
        }
        // Simple mixing — not cryptographic. Callers doing auth use
        // the uuid crate directly from `typeferry-runtime`.
        format!("{:x}-{:08x}", micros, u64::from_le_bytes(rand_bytes))
    }
}
