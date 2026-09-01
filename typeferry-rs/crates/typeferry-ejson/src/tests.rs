//! Unit tests for the EJSON layer. Covers base64 round-trips, every
//! tag form, decoy escaping, and end-to-end `Presentation` encode/
//! decode parity.

use super::*;
use crate::base64::{decode, encode};
use crate::value::EjsonMap as BTreeMap;
use crate::value::{EjsonValue, InfNaNSign};
use chrono::{TimeZone, Utc};

#[test]
fn base64_round_trip_matches_mime_alphabet() {
    assert_eq!(encode(b""), "");
    assert_eq!(encode(b"a"), "YQ==");
    assert_eq!(encode(b"ab"), "YWI=");
    assert_eq!(encode(b"abc"), "YWJj");

    let payload: Vec<u8> = (0u8..=255u8).collect();
    let encoded = encode(&payload);
    let decoded = decode(&encoded).unwrap();
    assert_eq!(decoded, payload);
}

#[test]
fn base64_accepts_url_safe_input() {
    let data = b"\xfa\xff\xf0";
    assert_eq!(encode(data), "+v/w");
    assert_eq!(decode("-v_w").unwrap(), data);
}

#[test]
fn base64_rejects_bad_inputs() {
    assert!(matches!(
        decode("abc"),
        Err(base64::Base64Error::InvalidLength)
    ));
    assert!(matches!(
        decode("!!!!"),
        Err(base64::Base64Error::InvalidChar)
    ));
}

#[test]
fn date_round_trips_through_json() {
    let dt = Utc.with_ymd_and_hms(2024, 6, 1, 12, 30, 45).unwrap();
    let encoded = Presentation::encode(&EjsonValue::Date(dt));
    let decoded = Presentation::decode(&encoded).unwrap();
    assert_eq!(decoded, EjsonValue::Date(dt));
    assert!(encoded.contains("\"$date\""));
}

#[test]
fn nan_and_infinities_use_tag_form() {
    for (value, sign) in [
        (EjsonValue::InfNaN(InfNaNSign::NaN), 0),
        (EjsonValue::InfNaN(InfNaNSign::PositiveInfinity), 1),
        (EjsonValue::InfNaN(InfNaNSign::NegativeInfinity), -1),
    ] {
        let encoded = Presentation::encode(&value);
        assert!(encoded.contains("\"$InfNaN\""));
        assert!(encoded.contains(&sign.to_string()));
        assert_eq!(Presentation::decode(&encoded).unwrap(), value);
    }
}

#[test]
fn binary_round_trip() {
    let value = EjsonValue::Binary(b"\xde\xad\xbe\xef".to_vec());
    let encoded = Presentation::encode(&value);
    assert!(encoded.contains("\"$binary\""));
    assert_eq!(Presentation::decode(&encoded).unwrap(), value);
}

#[test]
fn regex_flag_sanitization_round_trip() {
    let rx = converters::Regex {
        source: "^foo$".into(),
        flags: "gix".into(),
    };
    let encoded = Presentation::encode(&EjsonValue::Regex(rx));
    let decoded = Presentation::decode(&encoded).unwrap();
    // 'x' is not in the allowed JS flag set — it MUST be stripped.
    match decoded {
        EjsonValue::Regex(rx) => {
            assert_eq!(rx.source, "^foo$");
            assert_eq!(rx.flags, "gi");
        }
        other => panic!("unexpected: {other:?}"),
    }
}

#[test]
fn escape_wraps_decoy_date_shape() {
    let mut decoy = BTreeMap::new();
    decoy.insert("$date".to_string(), EjsonValue::Int(123));
    let encoded = Presentation::encode(&EjsonValue::Object(decoy.clone()));
    // Must be wrapped in $escape to survive decode.
    assert!(encoded.contains("\"$escape\""));

    let decoded = Presentation::decode(&encoded).unwrap();
    // Decoding the $escape form returns the original plain object —
    // NOT a Date.
    match decoded {
        EjsonValue::Object(map) => {
            assert_eq!(map.get("$date"), Some(&EjsonValue::Int(123)));
        }
        other => panic!("unexpected: {other:?}"),
    }
}

#[test]
fn custom_type_round_trip() {
    let value = EjsonValue::Custom {
        name: "address".to_string(),
        value: Box::new({
            let mut m = BTreeMap::new();
            m.insert(
                "street".to_string(),
                EjsonValue::String("1 Main".to_string()),
            );
            m.insert(
                "city".to_string(),
                EjsonValue::String("Springfield".to_string()),
            );
            EjsonValue::Object(m)
        }),
    };
    let encoded = Presentation::encode(&value);
    assert!(encoded.contains("\"$type\""));
    assert_eq!(Presentation::decode(&encoded).unwrap(), value);
}

#[test]
fn nested_containers_recurse() {
    let mut inner = BTreeMap::new();
    inner.insert(
        "at".to_string(),
        EjsonValue::Date(Utc.timestamp_opt(0, 0).unwrap()),
    );
    inner.insert("blob".to_string(), EjsonValue::Binary(vec![1, 2, 3]));

    let mut outer = BTreeMap::new();
    outer.insert(
        "list".to_string(),
        EjsonValue::Array(vec![EjsonValue::Int(1), EjsonValue::Object(inner.clone())]),
    );
    outer.insert("meta".to_string(), EjsonValue::Object(inner));

    let encoded = Presentation::encode(&EjsonValue::Object(outer.clone()));
    let decoded = Presentation::decode(&encoded).unwrap();
    assert_eq!(decoded, EjsonValue::Object(outer));
}

#[test]
fn stable_stringify_sorts_keys_recursively() {
    let input = serde_json::json!({
        "z": {"b": 1, "a": 2},
        "a": [1, 2, 3],
    });
    let out = stable_stringify::stringify(&input);
    assert_eq!(out, r#"{"a":[1,2,3],"z":{"a":2,"b":1}}"#);
}
