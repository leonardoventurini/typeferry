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
    CLIENT_ID_HEADER_KEY, HTTP_ENDPOINT_PATH, TOKEN_HEADER_KEY,
    errors::{
        INTERNAL_ERROR, INVALID_REQUEST, METHOD_FORBIDDEN, METHOD_NOT_FOUND,
    },
};
use bifrost_runtime::{BifrostError, ClientNode, Server};
use serde_json::{Map, Value};
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
        // METHOD_NOT_FOUND envelope carries `method` only (no uuid),
        // matching TS sendError behaviour.
        return error_response(METHOD_NOT_FOUND, None, Some(&method_name), is_void);
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

    // Run the auth callback (if configured). Truthy result flips
    // `authenticated` and becomes the node context — matches TS/Python.
    let auth_result = server.run_auth(node.clone(), ctx_json).await;
    let is_truthy = matches!(
        &auth_result,
        Value::Object(_)
            | Value::Array(_)
            | Value::String(_)
            | Value::Number(_)
            | Value::Bool(true)
    );
    if is_truthy {
        node.set_authenticated(true);
    }
    node.set_context(auth_result);

    if method.is_protected && !node.is_authenticated() {
        // METHOD_FORBIDDEN envelope carries `method` only (no uuid).
        return error_response(METHOD_FORBIDDEN, None, Some(&method_name), is_void);
    }

    let params_json = payload
        .get("params")
        .map(bifrost_value_to_json)
        .unwrap_or(Value::Null);

    let outcome = method.exec(params_json, node).await;

    match outcome {
        // Per PROTOCOL.md §2.1.3, void suppresses error responses ONLY;
        // success bodies still return.
        Ok(result) => success_response(&method_name, uuid.as_deref(), &result),

        // PublicError envelope carries `uuid`, no `method` — matches TS sendError.
        Err(BifrostError::Public(public)) => {
            if is_void {
                return empty_200();
            }
            error_response(&public.message, uuid, None, false)
        }

        // SchemaValidationError envelope carries `uuid` + `errors`, no `method`.
        Err(BifrostError::Schema(err)) => {
            if is_void {
                return empty_200();
            }
            let mut body = serde_json::Map::new();
            body.insert("type".into(), Value::String("error".into()));
            body.insert("message".into(), Value::String(err.message.clone()));
            if let Some(u) = uuid.as_ref() {
                body.insert("uuid".into(), Value::String(u.clone()));
            }
            body.insert("errors".into(), serde_json::to_value(&err.errors).unwrap());
            json_response(&Value::Object(body))
        }

        // Unknown errors → INTERNAL_ERROR with uuid only.
        Err(_) => {
            if is_void {
                return empty_200();
            }
            error_response(INTERNAL_ERROR, uuid, None, false)
        }
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
    // Build the envelope manually so a missing uuid is OMITTED rather
    // than serialized as null — matches TS / Python wire output.
    let mut body = serde_json::Map::new();
    body.insert("type".into(), Value::String("result".into()));
    body.insert("method".into(), Value::String(method.to_string()));
    body.insert("result".into(), result.clone());
    if let Some(u) = uuid {
        body.insert("uuid".into(), Value::String(u.to_string()));
    }
    json_response(&Value::Object(body))
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
    let mut body = serde_json::Map::new();
    body.insert("type".into(), Value::String("error".into()));
    body.insert("message".into(), Value::String(message.to_string()));
    if let Some(u) = uuid {
        body.insert("uuid".into(), Value::String(u));
    }
    if let Some(m) = method {
        body.insert("method".into(), Value::String(m.to_string()));
    }
    json_response(&Value::Object(body))
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
