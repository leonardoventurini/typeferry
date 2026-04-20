use crate::types::CookieOptions;

fn default_secure() -> bool {
    std::env::var("NODE_ENV").map(|v| v == "production").unwrap_or(false)
}

pub fn set_refresh_token_cookie(token: &str, options: &CookieOptions) -> String {
    let max_age = options.max_age_days * 24 * 60 * 60;
    let secure = options.secure.unwrap_or_else(default_secure);
    let encoded = urlencode(token);

    let mut parts = vec![
        format!("{}={}", options.name, encoded),
        "HttpOnly".into(),
        format!("Path={}", options.path),
        format!("Max-Age={max_age}"),
        format!("SameSite={}", options.same_site.as_str()),
    ];
    if secure {
        parts.push("Secure".into());
    }
    parts.join("; ")
}

pub fn clear_refresh_token_cookie(name: &str, path: &str, secure: Option<bool>) -> String {
    let secure = secure.unwrap_or_else(default_secure);
    let mut parts = vec![
        format!("{name}="),
        "HttpOnly".into(),
        format!("Path={path}"),
        "Max-Age=0".into(),
        "SameSite=Lax".into(),
    ];
    if secure {
        parts.push("Secure".into());
    }
    parts.join("; ")
}

fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_flags() {
        // SAFETY: test is single-threaded; env access is scoped to this test.
        unsafe { std::env::remove_var("NODE_ENV") };
        let header = set_refresh_token_cookie(
            "tok",
            &CookieOptions::new("bf_refresh", 7),
        );
        assert!(header.starts_with("bf_refresh=tok"));
        assert!(header.contains("HttpOnly"));
        assert!(header.contains("Path=/"));
        assert!(header.contains("Max-Age=604800"));
        assert!(header.contains("SameSite=Lax"));
        assert!(!header.contains("Secure"));
    }

    #[test]
    fn urlencode_escapes_specials() {
        assert_eq!(urlencode("a=b;c"), "a%3Db%3Bc");
    }

    #[test]
    fn clear_sets_max_age_zero() {
        let header = clear_refresh_token_cookie("bf_refresh", "/", Some(false));
        assert!(header.contains("Max-Age=0"));
    }
}
