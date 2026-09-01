use typeferry_macros::method;
use typeferry_runtime::{BoxResult, ClientNode};
use serde_json::Value;
use std::sync::Arc;

// `bogus` is not a recognized #[method] option.
#[method(bogus)]
async fn bad(_node: Arc<ClientNode>, _p: Value) -> BoxResult {
    Ok(Value::Null)
}

fn main() {}
