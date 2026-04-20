//! Smoke test: every re-exported surface is reachable through the
//! umbrella crate without naming the underlying crates.

use bifrost::{
    AuthFn, ClientNode, MethodOptions, Server, ServerOptions, ejson, protocol, runtime,
};
use std::sync::Arc;

#[test]
fn core_re_exports_are_reachable() {
    let _ = ServerOptions::default();
    let server = Server::new(ServerOptions::default());
    let _: &Arc<Server> = &server;
    let _ = ClientNode::new(None);
    let _ = MethodOptions::default();
    // namespace-style re-exports
    let _: ejson::EjsonValue = ejson::EjsonValue::Null;
    let _ = protocol::HTTP_ENDPOINT_PATH;
    let _: Option<AuthFn> = None;
    let _ = runtime::SocketState::OPEN;
}

#[cfg(feature = "http")]
#[test]
fn http_router_is_reachable() {
    let server = Server::new(ServerOptions::default());
    let _ = bifrost::http::router(server);
}

#[cfg(feature = "ws")]
#[test]
fn ws_router_is_reachable() {
    let server = Server::new(ServerOptions::default());
    let _ = bifrost::ws::router(server);
}

#[cfg(feature = "auth")]
#[test]
fn auth_namespace_is_reachable() {
    let _ = bifrost::auth::AuthConfig::new("unit-test-secret-that-is-sufficiently-long");
}

#[cfg(feature = "macros")]
mod macros_smoke {
    use bifrost::{BoxResult, ClientNode, Server, ServerOptions};
    use serde_json::{Value, json};
    use std::sync::Arc;

    #[bifrost::method]
    async fn ping(_node: Arc<ClientNode>, _params: Value) -> BoxResult {
        Ok(json!("pong"))
    }

    #[tokio::test]
    async fn macro_register_works_via_umbrella() {
        let server = Server::new(ServerOptions::default());
        bifrost::register!(server, [ping]);
        let result = server
            .call_method_on_node("ping", Value::Null, ClientNode::new(None))
            .await
            .unwrap();
        assert_eq!(result, json!("pong"));
    }
}
