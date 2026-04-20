use bifrost_macros::method;
use bifrost_runtime::{BoxResult, ClientNode};
use serde_json::Value;
use std::sync::Arc;

// #[method] must be applied to an async fn.
#[method]
fn not_async(_node: Arc<ClientNode>, _p: Value) -> BoxResult {
    Ok(Value::Null)
}

fn main() {}
