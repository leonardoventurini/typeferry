//! EJSON — extended JSON with tagged representations for Date,
//! RegExp, NaN/Inf, Binary, escape wrappers, and registered custom
//! types. Port of the Python / TypeScript EJSON implementations.
//!
//! See `PROTOCOL.md` §3 for the normative wire-form specification.

pub mod base64 {
    //! Base64 encoding/decoding with the MIME alphabet.
    //!
    //! Mirrors `bifrost-ts/src/ejson/base64.ts` byte-for-byte. We
    //! intentionally vendor the implementation (instead of delegating
    //! to the `base64` crate) so behavior stays byte-identical across
    //! the three language ports.

    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const INVALID: u8 = 0xFF;

    fn build_lookup() -> [u8; 256] {
        let mut lookup = [INVALID; 256];
        let mut i = 0usize;
        while i < 64 {
            lookup[ALPHABET[i] as usize] = i as u8;
            i += 1;
        }
        // URL-safe aliases accepted on decode.
        lookup[b'-' as usize] = 62;
        lookup[b'_' as usize] = 63;
        lookup
    }

    pub fn encode(bytes: &[u8]) -> String {
        let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
        let mut i = 0usize;
        while i < bytes.len() {
            let b0 = bytes[i] as u32;
            let b1 = if i + 1 < bytes.len() { bytes[i + 1] as u32 } else { 0 };
            let b2 = if i + 2 < bytes.len() { bytes[i + 2] as u32 } else { 0 };
            let chunk = (b0 << 16) | (b1 << 8) | b2;
            let remaining = bytes.len() - i;

            out.push(ALPHABET[((chunk >> 18) & 63) as usize] as char);
            out.push(ALPHABET[((chunk >> 12) & 63) as usize] as char);
            out.push(if remaining > 1 {
                ALPHABET[((chunk >> 6) & 63) as usize] as char
            } else {
                '='
            });
            out.push(if remaining > 2 {
                ALPHABET[(chunk & 63) as usize] as char
            } else {
                '='
            });
            i += 3;
        }
        out
    }

    #[derive(Debug, thiserror::Error)]
    pub enum Base64Error {
        #[error("Invalid base64 string length")]
        InvalidLength,
        #[error("Invalid base64 character")]
        InvalidChar,
    }

    pub fn decode(value: &str) -> Result<Vec<u8>, Base64Error> {
        if value.len() % 4 != 0 {
            return Err(Base64Error::InvalidLength);
        }

        let lookup = build_lookup();
        let bytes = value.as_bytes();

        let pad_index = bytes.iter().position(|&b| b == b'=');
        let valid_length = pad_index.unwrap_or(bytes.len());
        let placeholder_length = if valid_length == bytes.len() {
            0
        } else {
            4 - (valid_length % 4)
        };

        let output_length =
            (valid_length + placeholder_length) * 3 / 4 - placeholder_length;
        let mut out = vec![0u8; output_length];

        let mut byte_index = 0usize;
        let end = if placeholder_length > 0 {
            valid_length - 4
        } else {
            valid_length
        };
        let mut index = 0usize;

        let read = |lookup: &[u8; 256], b: u8| -> Result<u8, Base64Error> {
            let v = lookup[b as usize];
            if v == INVALID {
                Err(Base64Error::InvalidChar)
            } else {
                Ok(v)
            }
        };

        while index < end {
            let c0 = read(&lookup, bytes[index])?;
            let c1 = read(&lookup, bytes[index + 1])?;
            let c2 = read(&lookup, bytes[index + 2])?;
            let c3 = read(&lookup, bytes[index + 3])?;
            let chunk = ((c0 as u32) << 18)
                | ((c1 as u32) << 12)
                | ((c2 as u32) << 6)
                | (c3 as u32);
            out[byte_index] = ((chunk >> 16) & 0xFF) as u8;
            out[byte_index + 1] = ((chunk >> 8) & 0xFF) as u8;
            out[byte_index + 2] = (chunk & 0xFF) as u8;
            byte_index += 3;
            index += 4;
        }

        if placeholder_length == 2 {
            let c0 = read(&lookup, bytes[index])? as u32;
            let c1 = read(&lookup, bytes[index + 1])? as u32;
            let chunk = (c0 << 2) | (c1 >> 4);
            out[byte_index] = (chunk & 0xFF) as u8;
        } else if placeholder_length == 1 {
            let c0 = read(&lookup, bytes[index])? as u32;
            let c1 = read(&lookup, bytes[index + 1])? as u32;
            let c2 = read(&lookup, bytes[index + 2])? as u32;
            let chunk = (c0 << 10) | (c1 << 4) | (c2 >> 2);
            out[byte_index] = ((chunk >> 8) & 0xFF) as u8;
            out[byte_index + 1] = (chunk & 0xFF) as u8;
        }

        Ok(out)
    }
}

pub mod stable_stringify {
    //! Canonical JSON output with recursively sorted object keys.
    //!
    //! Port of `bifrost-ts/src/ejson/stable-stringify.ts`.

    use serde_json::{Map, Value};

    pub fn sort_value(value: Value) -> Value {
        match value {
            Value::Array(items) => {
                Value::Array(items.into_iter().map(sort_value).collect())
            }
            Value::Object(map) => {
                let mut entries: Vec<(String, Value)> =
                    map.into_iter().map(|(k, v)| (k, sort_value(v))).collect();
                entries.sort_by(|a, b| a.0.cmp(&b.0));
                let mut sorted = Map::new();
                for (k, v) in entries {
                    sorted.insert(k, v);
                }
                Value::Object(sorted)
            }
            other => other,
        }
    }

    pub fn stringify(value: &Value) -> String {
        let sorted = sort_value(value.clone());
        serde_json::to_string(&sorted).expect("canonical JSON serialization is total")
    }
}

pub mod converters;
pub mod presentation;
pub mod value;

pub use converters::{Regex, from_json_value, to_json_value};
pub use presentation::Presentation;
pub use value::{EjsonValue, InfNaNSign};

#[cfg(test)]
mod tests;
