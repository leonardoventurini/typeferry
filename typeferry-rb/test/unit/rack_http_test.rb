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

  def test_configured_origins_allow_matching_and_non_browser_requests
    server = TypeFerry::Server.new
    server.add_method("ping", ->(*) { true })
    app = TypeFerry::Transports::RackHTTP.new(server, origins: ["https://studio.test"], rate_limit: nil)

    assert_equal 200, post(app, "ping", "HTTP_ORIGIN" => "https://studio.test").status
    assert_equal 200, post(app, "ping").status
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
    app = TypeFerry::Transports::RackHTTP.new(server, rate_limit: nil)

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
    app = TypeFerry::Transports::RackHTTP.new(server)

    120.times { assert_equal 200, post(app, "ping").status }

    assert_equal 429, post(app, "ping").status
  end

  private

  def post(app, method, headers = {})
    body = TypeFerry::EJSON.stringify({"context" => {}, "payload" => {"method" => method}})
    Rack::MockRequest.new(app).post(TypeFerry::Protocol::HTTP_PATH, headers.merge(input: body))
  end
end
