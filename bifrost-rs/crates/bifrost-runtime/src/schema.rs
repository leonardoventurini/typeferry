//! Schema validation protocol — minimal surface so callers can plug
//! in serde-based validators, `validator` crate, or custom logic.

use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ValidationIssue {
    pub path: Vec<String>,
    pub message: String,
}

impl ValidationIssue {
    pub fn format(&self) -> String {
        format!("{}: {}", self.path.join("."), self.message)
    }
}

#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub success: bool,
    pub data: Option<Value>,
    pub issues: Vec<ValidationIssue>,
}

impl ValidationResult {
    pub fn ok(data: Value) -> Self {
        Self { success: true, data: Some(data), issues: vec![] }
    }

    pub fn failure(issues: Vec<ValidationIssue>) -> Self {
        Self { success: false, data: None, issues }
    }
}

/// Validator interface. `safe_parse` is called before the method
/// handler executes; failure throws :class:`SchemaValidationError`.
pub trait SchemaValidator: Send + Sync {
    fn safe_parse(&self, value: &Value) -> ValidationResult;
}

pub type SchemaValidatorArc = Arc<dyn SchemaValidator>;
