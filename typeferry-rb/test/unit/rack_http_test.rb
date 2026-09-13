# frozen_string_literal: true

require "rack/mock"
require "typeferry/transports/rack_http"
require_relative "../test_helper"

class RackHTTPTest < Minitest::Test
  def test_configured_origins_reject_disallowed_browser_requests
    called = false
    server = TypeFerry::Server.new
    server.add_method("inspect", ->(*) { called = true })
    app = TypeFerry::Transports::RackHTTP.new(server, origins: ["https://studio.test"], rate_limit: nil)

    response = post(app, "inspect", "HTTP_ORIGIN" => "https://attacker.test")

    assert_equal 403, response.status
    assert_empty response.body
    refute called
  end

  def test_configured_origins_require_an_explicit_matching_origin
    server = TypeFerry::Server.new
    server.add_method("ping", ->(*) { true })
    app = TypeFerry::Transports::RackHTTP.new(server, origins: ["https://studio.test"], rate_limit: nil)

    assert_equal 200, post(app, "ping", "HTTP_ORIGIN" => "https://studio.test").status
    assert_equal 403, post(app, "ping").status
  end

  def test_originless_clients_require_an_explicit_compatibility_option
    server = TypeFerry::Server.new
    server.add_method("ping", ->(*) { true })
    app = TypeFerry::Transports::RackHTTP.new(server, origins: ["https://studio.test"], allow_originless: true,
      rate_limit: nil)

    assert_equal 200, post(app, "ping").status
  end

  def test_rejects_declared_and_streamed_bodies_over_the_limit
    server = TypeFerry::Server.new
    app = TypeFerry::Transports::RackHTTP.new(server, max_body_bytes: 8, rate_limit: nil, allow_originless: true)

    assert_equal 413, Rack::MockRequest.new(app).post(TypeFerry::Protocol::HTTP_PATH, input: "x" * 9).status
  end

  def test_uses_the_explicit_client_address_resolver
    server = TypeFerry::Server.new
    server.add_method("inspect", ->(node, *) { node.remote_address })
    resolver = ->(environment) { environment.fetch("REMOTE_ADDR") }
    app = TypeFerry::Transports::RackHTTP.new(server, rate_limit: nil, allow_originless: true,
      client_address_resolver: resolver)

    result = TypeFerry::EJSON.parse(post(app, "inspect", "REMOTE_ADDR" => "192.0.2.12",
      "HTTP_X_FORWARDED_FOR" => "203.0.113.9").body).fetch("result")
    assert_equal "192.0.2.12", result
  end

  def test_request_metadata_is_normalized_and_immutable
    server = TypeFerry::Server.new
    server.add_method("inspect", lambda { |node, _params|
      {
        "headers" => node.headers,
        "headersFrozen" => node.headers.frozen? && node.headers.all? { |name, value| name.frozen? && value.frozen? },
        "remoteAddress" => node.remote_address,
        "userAgent" => node.user_agent
      }
    })
    app = TypeFerry::Transports::RackHTTP.new(server, rate_limit: nil, allow_originless: true)

    response = post(app, "inspect",
      "CONTENT_TYPE" => "text/plain",
      "HTTP_COOKIE" => "studio_session=secret",
      "HTTP_USER_AGENT" => "Studio Browser",
      "REMOTE_ADDR" => "192.0.2.10")
    result = TypeFerry::EJSON.parse(response.body).fetch("result")

    assert_equal "studio_session=secret", result.fetch("headers").fetch("cookie")
    assert_equal "text/plain", result.fetch("headers").fetch("content-type")
    assert result.fetch("headersFrozen")
    assert_equal "192.0.2.10", result.fetch("remoteAddress")
    assert_equal "Studio Browser", result.fetch("userAgent")
  end

  def test_default_rate_limit_allows_120_requests_per_window
    server = TypeFerry::Server.new
    server.add_method("ping", ->(*) { true })
    app = TypeFerry::Transports::RackHTTP.new(server, allow_originless: true)

    120.times { assert_equal 200, post(app, "ping").status }

    assert_equal 429, post(app, "ping").status
  end

  private

  def post(app, method, headers = {})
    body = TypeFerry::EJSON.stringify({"context" => {}, "payload" => {"method" => method}})
    Rack::MockRequest.new(app).post(TypeFerry::Protocol::HTTP_PATH, headers.merge(input: body))
  end
end
