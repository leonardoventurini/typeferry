//! Built-in EJSON converters — port of
//! `bifrost-ts/src/ejson/built-in-converters.ts` and
//! `bifrost-py/src/bifrost/ejson/converters.py`.

use crate::base64::{decode as decode_base64, encode as encode_base64};
use crate::value::{EjsonValue, InfNaNSign};
use chrono::{TimeZone, Utc};
use serde_json::{Map, Number, Value};

/// Wire-faithful regex container (source + flag string).
///
/// JS `RegExp.flags` maps poorly to Rust regex flags, so we preserve
/// the original strings and let callers rebuild a compiled pattern
/// when they want one (same design as the Python port).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Regex {
    pub source: String,
    pub flags: String,
}

const VALID_FLAGS: &[char] = &['g', 'i', 'm', 'u', 'y'];

fn sanitize_flags(raw: &str) -> String {
    let capped = raw.chars().take(50);
    let mut seen = [false; 128];
    let mut out = String::new();
    for c in capped {
        if !VALID_FLAGS.contains(&c) {
            continue;
        }
        let idx = c as usize;
        if idx < seen.len() && !seen[idx] {
            seen[idx] = true;
            out.push(c);
        }
    }
    out
}

/// Convert a Rust `EjsonValue` into its JSON-compatible tag form.
pub fn to_json_value(value: &EjsonValue) -> Value {
    match value {
        EjsonValue::Null => Value::Null,
        EjsonValue::Bool(b) => Value::Bool(*b),
        EjsonValue::Int(i) => Value::Number(Number::from(*i)),
        EjsonValue::Float(f) => Number::from_f64(*f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        EjsonValue::String(s) => Value::String(s.clone()),

        EjsonValue::Array(items) => {
            Value::Array(items.iter().map(to_json_value).collect())
        }

        EjsonValue::Object(map) => {
            if looks_like_tag_form(map) {
                let mut escape = Map::new();
                for (k, v) in map {
                    escape.insert(k.clone(), to_json_value(v));
                }
                let mut outer = Map::new();
                outer.insert("$escape".to_string(), Value::Object(escape));
                Value::Object(outer)
            } else {
                let mut encoded = Map::new();
                for (k, v) in map {
                    encoded.insert(k.clone(), to_json_value(v));
                }
                Value::Object(encoded)
            }
        }

        EjsonValue::Date(dt) => {
            let millis = dt.timestamp_millis();
            let mut obj = Map::new();
            obj.insert("$date".to_string(), Value::Number(Number::from(millis)));
            Value::Object(obj)
        }

        EjsonValue::Binary(bytes) => {
            let mut obj = Map::new();
            obj.insert(
                "$binary".to_string(),
                Value::String(encode_base64(bytes)),
            );
            Value::Object(obj)
        }

        EjsonValue::Regex(rx) => {
            let mut obj = Map::new();
            obj.insert("$regexp".to_string(), Value::String(rx.source.clone()));
            obj.insert("$flags".to_string(), Value::String(rx.flags.clone()));
            Value::Object(obj)
        }

        EjsonValue::InfNaN(sign) => {
            let mut obj = Map::new();
            obj.insert(
                "$InfNaN".to_string(),
                Value::Number(Number::from(*sign as i64)),
            );
            Value::Object(obj)
        }

        EjsonValue::Custom { name, value } => {
            let mut obj = Map::new();
            obj.insert("$type".to_string(), Value::String(name.clone()));
            obj.insert("$value".to_string(), to_json_value(value));
            Value::Object(obj)
        }
    }
}

/// Inverse of [`to_json_value`].
pub fn from_json_value(value: &Value) -> EjsonValue {
    match value {
        Value::Null => EjsonValue::Null,
        Value::Bool(b) => EjsonValue::Bool(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                EjsonValue::Int(i)
            } else if let Some(f) = n.as_f64() {
                EjsonValue::from_f64(f)
            } else {
                EjsonValue::Null
            }
        }
        Value::String(s) => EjsonValue::String(s.clone()),
        Value::Array(items) => {
            EjsonValue::Array(items.iter().map(from_json_value).collect())
        }
        Value::Object(map) => decode_object(map),
    }
}

fn decode_object(map: &Map<String, Value>) -> EjsonValue {
    // Match the TS gate: tag forms have ≤2 keys and every key starts with '$'.
    if map.len() <= 2 && map.keys().all(|k| k.starts_with('$')) {
        if let Some(decoded) = decode_tag(map) {
            return decoded;
        }
    }
    let mut out = crate::value::EjsonMap::new();
    for (k, v) in map {
        out.insert(k.clone(), from_json_value(v));
    }
    EjsonValue::Object(out)
}

fn decode_tag(map: &Map<String, Value>) -> Option<EjsonValue> {
    if let Some(ms) = map.get("$date").and_then(|v| v.as_i64())
        && map.len() == 1
    {
        return Some(EjsonValue::Date(Utc.timestamp_millis_opt(ms).unwrap()));
    }
    if map.len() == 2
        && let (Some(source), Some(flags)) = (map.get("$regexp"), map.get("$flags"))
        && let (Some(s), Some(f)) = (source.as_str(), flags.as_str())
    {
        return Some(EjsonValue::Regex(Regex {
            source: s.to_string(),
            flags: sanitize_flags(f),
        }));
    }
    if let Some(sign) = map.get("$InfNaN").and_then(|v| v.as_i64())
        && map.len() == 1
    {
        return Some(EjsonValue::InfNaN(match sign {
            0 => InfNaNSign::NaN,
            1 => InfNaNSign::PositiveInfinity,
            _ => InfNaNSign::NegativeInfinity,
        }));
    }
    if let Some(b64) = map.get("$binary").and_then(|v| v.as_str())
        && map.len() == 1
    {
        let bytes = decode_base64(b64).ok()?;
        return Some(EjsonValue::Binary(bytes));
    }
    if let Some(inner) = map.get("$escape").and_then(|v| v.as_object())
        && map.len() == 1
    {
        let mut out = crate::value::EjsonMap::new();
        for (k, v) in inner {
            out.insert(k.clone(), from_json_value(v));
        }
        return Some(EjsonValue::Object(out));
    }
    if map.len() == 2
        && let (Some(name), Some(value)) = (map.get("$type"), map.get("$value"))
        && let Some(name_str) = name.as_str()
    {
        return Some(EjsonValue::Custom {
            name: name_str.to_string(),
            value: Box::new(from_json_value(value)),
        });
    }
    None
}

fn looks_like_tag_form(map: &crate::value::EjsonMap) -> bool {
    if map.len() > 2 || map.is_empty() {
        return false;
    }
    let keys: Vec<&String> = map.keys().collect();
    match (map.len(), keys.first().map(|s| s.as_str())) {
        (1, Some("$date")) => true,
        (1, Some("$InfNaN")) => true,
        (1, Some("$binary")) => true,
        (1, Some("$escape")) => true,
        (2, _) => {
            let ks: Vec<&str> = keys.iter().map(|s| s.as_str()).collect();
            (ks.contains(&"$regexp") && ks.contains(&"$flags"))
                || (ks.contains(&"$type") && ks.contains(&"$value"))
        }
        _ => false,
    }
}
