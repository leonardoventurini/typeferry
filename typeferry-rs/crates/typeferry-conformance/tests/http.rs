//! Replay every HTTP fixture against the Rust HTTP transport.
//!
//! Drives the axum router via `tower::ServiceExt::oneshot` so the
//! tests don't need to bind a real socket.

use axum::body::{Body, to_bytes};
use axum::http::{Request, header};
use serde_json::Value;
use tower::ServiceExt;
use typeferry_conformance::{configure_server, list_cases, load_json};
use typeferry_runtime::{Server, ServerOptions};

#[tokio::test]
async fn http_fixtures_match_rust_runtime() {
    let cases = list_cases("http", ".case.json");
    assert!(!cases.is_empty(), "no HTTP fixtures found");

    for case_path in cases {
        let fixture = load_json(&case_path);
        let server = Server::new(ServerOptions::default());
        configure_server(&server, fixture.get("setup"));

        let router = typeferry_http::router(server);
        let request_headers = fixture["request"]["headers"].as_object().unwrap();
        let request_body = fixture["request"]["body"].as_str().unwrap().to_string();

        let mut builder = Request::builder()
            .method("POST")
            .uri("/__h")
            .header(header::CONTENT_TYPE, "text/plain");
        for (name, value) in request_headers {
            if name.eq_ignore_ascii_case("content-type") {
                continue;
            }
            builder = builder.header(name, value.as_str().unwrap());
        }
        let req = builder.body(Body::from(request_body)).unwrap();

        let response = router.oneshot(req).await.unwrap();
        let status = response.status().as_u16();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let text = String::from_utf8(bytes.to_vec()).unwrap();

        let expected_status = fixture["response"]["status"].as_u64().unwrap() as u16;
        assert_eq!(
            status,
            expected_status,
            "{}: status mismatch (body={text})",
            case_path.display()
        );

        if let Some(expected_body) = fixture["response"].get("body").and_then(|v| v.as_str()) {
            assert_eq!(
                text,
                expected_body,
                "{}: body mismatch",
                case_path.display()
            );
        } else if let Some(expected_decoded) = fixture["response"].get("decoded") {
            let actual: Value = serde_json::from_str(&text).unwrap_or_else(|e| {
                panic!(
                    "{}: response was not JSON: {text} ({e})",
                    case_path.display()
                )
            });
            assert_eq!(
                &actual,
                expected_decoded,
                "{}: decoded body mismatch",
                case_path.display()
            );
        }
    }
}
