//! Execution context — `tokio::task_local` equivalent of the TS
//! `AsyncLocalStorage.run` / Python `contextvars` wrapper.

use serde_json::Value;

tokio::task_local! {
    pub(crate) static CURRENT: ExecutionContext;
}

/// Ambient store attached to every RPC execution.
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub execution_id: String,
    pub context: Value,
}

pub struct BifrostContext;

impl BifrostContext {
    /// Return the current execution context, or None outside an RPC.
    pub fn try_current() -> Option<ExecutionContext> {
        CURRENT.try_with(|c| c.clone()).ok()
    }

    /// Run `future` with a fresh ambient [`ExecutionContext`].
    pub async fn run<F, T>(execution_id: String, context: Value, future: F) -> T
    where
        F: std::future::Future<Output = T>,
    {
        let ctx = ExecutionContext { execution_id, context };
        CURRENT.scope(ctx, future).await
    }
}
