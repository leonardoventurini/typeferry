//! WebSocket dispatch unit tests using a mock socket.
//!
//! Exercises the frame-routing layer of `typeferry-ws` without needing a
//! real axum WebSocket. Covers PROTOCOL.md §5.1–5.2.

use async_trait::async_trait;
use futures::FutureExt;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use typeferry_runtime::error::PublicError;
use typeferry_runtime::{
    ClientNode, MethodOptions, Server, ServerOptions, SocketState, TypeFerryError, TypeFerrySocket,
};
use typeferry_ws::dispatch_frame;

struct MockSocket {
    id: u64,
    state: AtomicU8,
    sent: Mutex<Vec<String>>,
}

impl MockSocket {
    fn new(id: u64) -> Arc<Self> {
        Arc::new(Self {
            id,
            state: AtomicU8::new(SocketState::OPEN),
            sent: Mutex::new(vec![]),
        })
    }

    fn frames(&self) -> Vec<Value> {
        self.sent
            .lock()
            .unwrap()
            .iter()
            .map(|text| serde_json::from_str(text).unwrap())
            .collect()
    }
}

#[async_trait]
impl TypeFerrySocket for MockSocket {
    fn ready_state(&self) -> u8 {
        self.state.load(Ordering::Relaxed)
    }
    async fn send(&self, data: String) {
        self.sent.lock().unwrap().push(data);
    }
    async fn close(&self) {
        self.state.store(SocketState::CLOSED, Ordering::Relaxed);
    }
    fn id(&self) -> u64 {
        self.id
    }
}

fn new_server() -> Arc<Server> {
    Server::new(ServerOptions::default())
}

#[tokio::test]
async fn rpc_frame_returns_result() {
    let server = new_server();
    let handler =
        Arc::new(|_n: Arc<ClientNode>, p: Value| async move { Ok(p["v"].clone()) }.boxed());
    server.add_method("echo", handler, MethodOptions::default());

    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc","id":"r1","method":"echo","params":{"v":42}}"#,
    )
    .await;

    let frames = socket.frames();
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0]["t"], "rpc:res");
    assert_eq!(frames[0]["id"], "r1");
    assert_eq!(frames[0]["result"], 42);
}

#[tokio::test]
async fn rpc_method_not_found_emits_error() {
    let server = new_server();
    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc","id":"r1","method":"nope"}"#,
    )
    .await;
    let frames = socket.frames();
    assert_eq!(frames[0]["error"], "Method Not Found");
}

#[tokio::test]
async fn rpc_forbidden_when_unauthenticated() {
    let server = new_server();
    let handler =
        Arc::new(|_n: Arc<ClientNode>, _p: Value| async move { Ok(json!("secret")) }.boxed());
    server.add_method(
        "s",
        handler,
        MethodOptions {
            protected: true,
            ..Default::default()
        },
    );

    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc","id":"r1","method":"s"}"#,
    )
    .await;
    assert_eq!(socket.frames()[0]["error"], "Method Forbidden");
}

#[tokio::test]
async fn rpc_public_error_passes_message_through() {
    let server = new_server();
    let handler = Arc::new(|_n: Arc<ClientNode>, _p: Value| {
        async move { Err(TypeFerryError::Public(PublicError::new("nope"))) }.boxed()
    });
    server.add_method("boom", handler, MethodOptions::default());

    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc","id":"r1","method":"boom"}"#,
    )
    .await;
    assert_eq!(socket.frames()[0]["error"], "nope");
}

#[tokio::test]
async fn rpc_void_sends_no_response() {
    let server = new_server();
    let handler = Arc::new(|_n: Arc<ClientNode>, _p: Value| {
        async move { Err(TypeFerryError::Public(PublicError::new("silent"))) }.boxed()
    });
    server.add_method("boom", handler, MethodOptions::default());

    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc:void","method":"boom"}"#,
    )
    .await;
    assert!(socket.frames().is_empty());
}

#[tokio::test]
async fn pong_frame_updates_pong_flag() {
    let server = new_server();
    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(false);

    dispatch_frame(&server, &node, &dyn_socket, &pong, r#"{"t":"pong"}"#).await;
    assert!(pong.load(Ordering::Relaxed));
}

#[tokio::test]
async fn unknown_frame_type_is_ignored() {
    let server = new_server();
    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(false);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"something-else"}"#,
    )
    .await;
    assert!(socket.frames().is_empty());
    assert!(!pong.load(Ordering::Relaxed));
}

#[tokio::test]
async fn malformed_frame_is_dropped_silently() {
    let server = new_server();
    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(false);

    dispatch_frame(&server, &node, &dyn_socket, &pong, "not-json").await;
    assert!(socket.frames().is_empty());
}

#[tokio::test]
async fn rpc_schema_validation_surfaces_errors_field() {
    use typeferry_runtime::{SchemaValidator, ValidationIssue, ValidationResult};

    struct RejectAll;
    impl SchemaValidator for RejectAll {
        fn safe_parse(&self, _v: &Value) -> ValidationResult {
            ValidationResult::failure(vec![ValidationIssue {
                path: vec!["x".into()],
                message: "required".into(),
            }])
        }
    }

    let server = new_server();
    let handler = Arc::new(|_n: Arc<ClientNode>, _p: Value| async move { unreachable!() }.boxed());
    server.add_method(
        "v",
        handler,
        MethodOptions {
            schema: Some(Arc::new(RejectAll)),
            ..Default::default()
        },
    );

    let socket = MockSocket::new(1);
    let dyn_socket: Arc<dyn TypeFerrySocket> = socket.clone();
    let node = ClientNode::new(Some(dyn_socket.clone()));
    let pong = AtomicBool::new(true);

    dispatch_frame(
        &server,
        &node,
        &dyn_socket,
        &pong,
        r#"{"t":"rpc","id":"r1","method":"v"}"#,
    )
    .await;
    let frames = socket.frames();
    assert!(
        frames[0]["error"]
            .as_str()
            .unwrap()
            .starts_with("Invalid Params")
    );
    assert_eq!(frames[0]["errors"], json!(["x: required"]));
}
