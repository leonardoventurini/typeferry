//! Redis envelope round-trip tests — no running Redis required.
//!
//! Covers PROTOCOL.md §2.3 publish/subscribe wire shape against
//! docs/conformance/fixtures/redis/ cases.

use bifrost_redis::{DecodedInbound, build_publish_envelope, decode_inbound};
use bifrost_protocol::NO_CHANNEL;
use serde_json::{Value, json};

#[test]
fn publish_envelope_without_exclude() {
    let payload = build_publish_envelope(
        "ping.tick",
        "room-a",
        r#"{"t":"event","uuid":"abc"}"#,
        None,
    );
    let parsed: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(parsed["event"], "ping.tick");
    assert_eq!(parsed["channel"], "room-a");
    assert_eq!(
        parsed["message"],
        r#"{"t":"event","uuid":"abc"}"#
    );
    assert!(!parsed.as_object().unwrap().contains_key("excludeUuid"));
}

#[test]
fn publish_envelope_with_exclude() {
    let payload = build_publish_envelope(
        "chat.message",
        "room-a",
        r#"{"t":"event"}"#,
        Some("orig-1"),
    );
    let parsed: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(parsed["excludeUuid"], "orig-1");
}

#[test]
fn empty_channel_normalizes_to_no_channel() {
    let payload = build_publish_envelope("x", "", "{\"t\":\"event\"}", None);
    let parsed: Value = serde_json::from_str(&payload).unwrap();
    assert_eq!(parsed["channel"], NO_CHANNEL);
}

#[test]
fn decode_inbound_returns_all_fields() {
    let raw = json!({
        "event": "chat.message",
        "channel": "room-a",
        "message": "{\"t\":\"event\"}",
        "excludeUuid": "peer-1",
    })
    .to_string();
    let decoded = decode_inbound(&raw).unwrap();
    assert_eq!(
        decoded,
        DecodedInbound {
            event: "chat.message".to_string(),
            channel: "room-a".to_string(),
            message: "{\"t\":\"event\"}".to_string(),
            exclude_uuid: Some("peer-1".to_string()),
        }
    );
}

#[test]
fn decode_inbound_without_exclude_leaves_field_none() {
    let raw = json!({
        "event": "e",
        "channel": "c",
        "message": "{\"t\":\"event\"}",
    })
    .to_string();
    let decoded = decode_inbound(&raw).unwrap();
    assert!(decoded.exclude_uuid.is_none());
}

#[test]
fn decode_inbound_rejects_missing_required_fields() {
    // Missing event.
    let raw = json!({"channel": "c", "message": "x"}).to_string();
    assert!(decode_inbound(&raw).is_none());
    // Empty message.
    let raw = json!({"event": "e", "channel": "c", "message": ""}).to_string();
    assert!(decode_inbound(&raw).is_none());
    // Not valid JSON.
    assert!(decode_inbound("not-json").is_none());
}

#[test]
fn decode_inbound_defaults_channel_to_no_channel() {
    let raw = json!({
        "event": "e",
        "message": "{\"t\":\"event\"}",
    })
    .to_string();
    let decoded = decode_inbound(&raw).unwrap();
    assert_eq!(decoded.channel, NO_CHANNEL);
}

/// Matches the shape in docs/conformance/fixtures/redis/011.
#[test]
fn fixture_011_exclude_round_trip() {
    let payload = build_publish_envelope(
        "chat.message",
        "room-a",
        r#"{"t":"event","uuid":"evt-1","event":"chat.message","channel":"room-a","params":{"text":"hi"}}"#,
        Some("orig-1"),
    );
    let decoded = decode_inbound(&payload).unwrap();
    assert_eq!(decoded.event, "chat.message");
    assert_eq!(decoded.channel, "room-a");
    assert_eq!(decoded.exclude_uuid, Some("orig-1".into()));
}
