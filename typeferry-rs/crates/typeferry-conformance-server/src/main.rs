//! Cross-language conformance server for the Rust runtime.
//!
//! Boots a TypeFerry server on `127.0.0.1:0`, registers the same fixed
//! method/event/auth surface as `typeferry-py/scripts/conformance_server.py`,
//! prints `TYPEFERRY_PORT=<port>` on stderr after binding, then serves
//! HTTP + WebSocket forever.

use std::sync::Arc;

use axum::Router;
use futures::FutureExt as _;
use serde_json::{Value, json};
use typeferry_runtime::{
    BoxResult, ClientNode, EventOptions, MethodOptions, Server, ServerOptions, event::Event,
};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let server = Server::new(ServerOptions {
        host: "127.0.0.1".into(),
        port: 0,
        debug: false,
    });

    // Auth: accept token == "good-token", attach { user: { _id: "u1" } }.
    server.set_auth(Arc::new(|_node: Arc<ClientNode>, ctx: Value| {
        async move {
            let token = ctx
                .get("token")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            if token == "good-token" {
                json!({ "user": { "_id": "u1" } })
            } else {
                Value::Null
            }
        }
        .boxed()
    }));

    // echo: returns the params unchanged.
    server.add_method(
        "echo",
        Arc::new(|_node, params| async move { Ok(params) }.boxed()),
        MethodOptions::default(),
    );

    // add: integer addition.
    server.add_method(
        "add",
        Arc::new(|_node, params: Value| {
            async move {
                let a = params.get("a").and_then(|v| v.as_i64()).unwrap_or(0);
                let b = params.get("b").and_then(|v| v.as_i64()).unwrap_or(0);
                Ok(json!(a + b))
            }
            .boxed()
        }),
        MethodOptions::default(),
    );

    // whoami: protected; reads context.user._id off the ClientNode.
    server.add_method(
        "whoami",
        Arc::new(|node: Arc<ClientNode>, _params| {
            async move {
                let ctx = node.context.read().expect("ctx poisoned").clone();
                let user_id = ctx
                    .get("user")
                    .and_then(|u| u.get("_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("anon")
                    .to_string();
                Ok::<Value, _>(json!(user_id)) as BoxResult
            }
            .boxed()
        }),
        MethodOptions {
            protected: true,
            ..Default::default()
        },
    );

    // Declare a public event the JS client can subscribe to.
    server.add_event(Event::new("ping.tick", EventOptions::default()));

    // emit_ping: server-side helper that fires `ping.tick` on the
    // requested channel with the supplied params, so the cross-lang
    // test can prove a subscribe + emit round-trip end-to-end.
    {
        let server_for_emit = server.clone();
        server.add_method(
            "emit_ping",
            Arc::new(move |_node, params: Value| {
                let server = server_for_emit.clone();
                async move {
                    let channel = params
                        .get("channel")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let body = params.get("params").cloned().unwrap_or(Value::Null);
                    if let Some(event) = server
                        .events
                        .read()
                        .ok()
                        .and_then(|m| m.get("ping.tick").cloned())
                    {
                        let (payload, _exclude) = event.encode_payload(&channel, &body);
                        server
                            .channel(&channel)
                            .propagate("ping.tick", &payload, None)
                            .await;
                    }
                    Ok::<Value, _>(json!(true)) as BoxResult
                }
                .boxed()
            }),
            MethodOptions::default(),
        );
    }

    // Combine the HTTP + WS routers under one axum Router.
    let http = typeferry_http::router(server.clone());
    let ws = typeferry_ws::router(server.clone());
    let app: Router = Router::new().merge(http).merge(ws);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    eprintln!("TYPEFERRY_PORT={port}");

    axum::serve(listener, app).await?;
    Ok(())
}
