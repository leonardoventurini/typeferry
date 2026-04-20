//! HTTP transport — `POST /__h`.
//!
//! Implements PROTOCOL.md §2.1 on top of `axum`.

use axum::{
    Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use bifrost_ejson::{EjsonValue, Presentation};
use bifrost_protocol::{
    CLIENT_ID_HEADER_KEY, HTTP_ENDPOINT_PATH, PayloadType, TOKEN_HEADER_KEY,
    errors::{
        INTERNAL_ERROR, INVALID_REQUEST, METHOD_FORBIDDEN, METHOD_NOT_FOUND,
    },
};
use bifrost_runtime::{BifrostError, ClientNode, Server};
use serde_json::{Map, Value, json};
use std::sync::Arc;

/// Build the axum router for the HTTP transport.
pub fn router(server: Arc<Server>) -> Router {
    Router::new()
        .route(HTTP_ENDPOINT_PATH, post(handle_rpc))
        .with_state(server)
}

async fn handle_rpc(
    State(server): State<Arc<Server>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let body_str = match std::str::from_utf8(&body) {
        Ok(s) => s,
        Err(_) => return error_response(INVALID_REQUEST, None, None, false),
    };

    let transport = match Presentation::decode(body_str) {
        Ok(EjsonValue::Object(map)) => map,
        _ => return error_response(INVALID_REQUEST, None, None, false),
    };

    let context_value = transport.get("context").cloned().unwrap_or(EjsonValue::Null);
    let Some(EjsonValue::Object(payload)) = transport.get("payload").cloned() else {
        return error_response(INVALID_REQUEST, None, None, false);
    };

    let method_name = match payload.get("method") {
        Some(EjsonValue::String(name)) if !name.is_empty() => name.clone(),
        _ => return error_response(METHOD_NOT_FOUND, None, None, false),
    };

    let uuid = match payload.get("uuid") {
        Some(EjsonValue::String(u)) => Some(u.clone()),
        _ => None,
    };
    let is_void = matches!(payload.get("void"), Some(EjsonValue::Bool(true)));

    let Some(method) = server.get_method(&method_name) else {
        return error_response(METHOD_NOT_FOUND, uuid, Some(&method_name), is_void);
    };

    // Build the client node with headers + auth context.
    let node = ClientNode::new(None);
    if let Some(client_uuid) = headers.get(CLIENT_ID_HEADER_KEY).and_then(|v| v.to_str().ok()) {
        if !client_uuid.is_empty() {
            node.set_id(client_uuid);
        }
    }
    // Token extraction; Bearer prefix stripped.
    let token = headers
        .get(TOKEN_HEADER_KEY)
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty() && *s != "undefined")
        .map(|s| s.trim_start_matches("Bearer ").to_string());

    // Assemble the auth context JSON (context + token).
    let mut ctx_json = bifrost_value_to_json(&context_value);
    if !ctx_json.is_object() {
        ctx_json = Value::Object(Map::new());
    }
    if let (Some(token), Some(obj)) = (token, ctx_json.as_object_mut()) {
        obj.insert("token".into(), Value::String(token));
    }
    node.set_context(ctx_json);

    if method.is_protected && !node.is_authenticated() {
        return error_response(METHOD_FORBIDDEN, uuid, Some(&method_name), is_void);
    }

    let params_json = payload
        .get("params")
        .map(bifrost_value_to_json)
        .unwrap_or(Value::Null);

    let outcome = method.exec(params_json, node).await;

    if is_void {
        return empty_200();
    }

    match outcome {
        Ok(result) => success_response(&method_name, uuid.as_deref(), &result),
        Err(BifrostError::Public(public)) => {
            error_response(&public.message, uuid, Some(&method_name), false)
        }
        Err(BifrostError::Schema(err)) => {
            let body = serde_json::json!({
                "type": PayloadType::Error,
                "message": err.message,
                "uuid": uuid,
                "method": method_name,
                "errors": err.errors,
            });
            json_response(&body)
        }
        Err(_) => error_response(INTERNAL_ERROR, uuid, Some(&method_name), false),
    }
}

fn empty_200() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(String::new().into())
        .expect("empty response")
}

fn success_response(method: &str, uuid: Option<&str>, result: &Value) -> Response {
    let body = json!({
        "type": PayloadType::Result,
        "uuid": uuid,
        "method": method,
        "result": result,
    });
    json_response(&body)
}

fn error_response(
    message: &str,
    uuid: Option<String>,
    method: Option<&str>,
    is_void: bool,
) -> Response {
    if is_void {
        return empty_200();
    }
    let mut body = json!({
        "type": PayloadType::Error,
        "message": message,
    });
    if let Some(u) = uuid {
        body["uuid"] = Value::String(u);
    }
    if let Some(m) = method {
        body["method"] = Value::String(m.to_string());
    }
    json_response(&body)
}

fn json_response(body: &Value) -> Response {
    let text = serde_json::to_string(body).expect("response body serializable");
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(text.into())
        .expect("response build")
}

/// Convert an `EjsonValue` back to a plain `serde_json::Value` for
/// handler consumption. Lossy for Date/Binary/Regex etc. — handlers
/// wanting typed round-trips should work with `EjsonValue` directly.
fn bifrost_value_to_json(value: &EjsonValue) -> Value {
    bifrost_ejson::to_json_value(value)
}

impl IntoResponse for HttpTransportError {
    fn into_response(self) -> Response {
        match self {
            HttpTransportError::Internal => {
                error_response(INTERNAL_ERROR, None, None, false)
            }
        }
    }
}

pub enum HttpTransportError {
    Internal,
}
