# frozen_string_literal: true

require "typeferry/auth"
require_relative "../test_helper"

class AuthTest < Minitest::Test
  def config(**options)
    TypeFerry::Auth::Config.new(secret: "s" * 32, **options)
  end

  def test_jwt_round_trip_and_bearer_prefix
    payload = TypeFerry::Auth::AccessTokenPayload.new(
      user_id: "user-1", session_id: "session-1", iat: Time.now.to_i, exp: Time.now.to_i + 900,
      claims: {"role" => "admin"}
    )

    token = TypeFerry::Auth.sign_access_token(payload, config)
    verified = TypeFerry::Auth.verify_access_token("Bearer #{token}", config)

    assert_equal payload, verified
    assert_equal payload, TypeFerry::Auth.decode_token(token)
    assert_nil TypeFerry::Auth.verify_access_token(token, config(secret: "x" * 32))
  end

  def test_auth_configuration_rejects_empty_secrets_and_non_hmac_algorithms
    assert_raises(ArgumentError) { config(secret: "") }
    assert_raises(ArgumentError) { config(algorithm: "none") }
    assert_raises(ArgumentError) { config(algorithm: "RS256") }
  end

  def test_cookie_matrix_matches_protocol_defaults_and_encoding
    options = TypeFerry::Auth::CookieOptions.new(name: "refresh", max_age_days: 14)

    assert_equal "refresh=a%20b%3Bc%3Dd; HttpOnly; Path=/; Max-Age=1209600; SameSite=Lax",
      TypeFerry::Auth.set_refresh_token_cookie("a b;c=d", options, production: false)
    assert_equal "refresh=; HttpOnly; Path=/auth; Max-Age=0; SameSite=Strict; Secure",
      TypeFerry::Auth.clear_refresh_token_cookie(name: "refresh", path: "/auth", same_site: "Strict", secure: true)
    assert_equal "a+b", TypeFerry::Auth.get_refresh_token_from_cookie_header("x=1; refresh=a+b", "refresh")
  end

  def test_device_information_is_derived_from_forwarded_headers
    device = TypeFerry::Auth.parse_device_info({
      "user-agent" => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      "x-forwarded-for" => "203.0.113.4"
    })

    assert_equal "203.0.113.4", device.ip
    assert_equal "mobile", device.device_type
    assert_equal "Mobile Safari 17.5", device.browser
    assert_equal "iOS 17.5", device.os
  end
end
