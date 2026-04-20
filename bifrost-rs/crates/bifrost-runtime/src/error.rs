//! Error types used across the runtime.

use thiserror::Error;

/// Intentional user-facing error; the message is sent verbatim to the client.
#[derive(Debug, Clone, Error)]
#[error("{message}")]
pub struct PublicError {
    pub message: String,
}

impl PublicError {
    pub fn new(message: impl Into<String>) -> Self {
        Self { message: message.into() }
    }
}

/// Schema validation failure; surfaces the per-issue list on the wire.
#[derive(Debug, Clone, Error)]
#[error("{message}")]
pub struct SchemaValidationError {
    pub message: String,
    pub errors: Vec<String>,
}

/// Unified runtime error surface.
#[derive(Debug, Error)]
pub enum BifrostError {
    #[error(transparent)]
    Public(#[from] PublicError),

    #[error(transparent)]
    Schema(#[from] SchemaValidationError),

    #[error("method not found: {0}")]
    MethodNotFound(String),

    #[error("method forbidden: {0}")]
    MethodForbidden(String),

    #[error("internal error: {0}")]
    Internal(String),
}
