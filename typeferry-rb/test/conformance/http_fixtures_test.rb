# frozen_string_literal: true

require "json"
require "rack/mock"
require "typeferry/transports/rack_http"
require_relative "../test_helper"

class HTTPFixturesTest < Minitest::Test
  Validator = Struct.new(:issues) do
    def safe_parse(_value) = TypeFerry::ValidationResult.new(false, nil, issues)
  end

  Dir[File.join(TypeFerryTest::FIXTURES, "http", "*.case.json")].sort.each do |path|
    define_method("test_#{File.basename(path, ".case.json").tr("-", "_")}") do
      fixture = JSON.parse(File.read(path))
      server = configured_server(fixture.fetch("setup"))
      app = TypeFerry::Transports::RackHTTP.new(server, rate_limit: nil)
      request = fixture.fetch("request")
      headers = request.fetch("headers").to_h { |key, value| ["HTTP_#{key.upcase.tr("-", "_")}", value] }
      response = Rack::MockRequest.new(app).post(TypeFerry::Protocol::HTTP_PATH,
        headers.merge(input: request.fetch("body")))

      assert_equal fixture.dig("response", "status"), response.status
      if fixture.dig("response", "body") == ""
        assert_empty response.body
      else
        assert_equal fixture.dig("response", "decoded"), TypeFerry::EJSON.parse(response.body)
      end
    end
  end

  private

  def configured_server(setup)
    server = TypeFerry::Server.new
    setup.fetch("methods", []).each do |definition|
      schema = definition["schema"] && Validator.new(definition["schema"].fetch("issues").map do |issue|
        TypeFerry::ValidationIssue.new(issue.fetch("path"), issue.fetch("message"))
      end)
      server.add_method(definition.fetch("name"), handler(definition.fetch("handler")),
        protected: definition.fetch("protected", false), schema:)
    end
    if setup["auth"]
      auth = setup.fetch("auth")
      server.set_auth(auth: ->(_node, context) {
        (context["token"] == auth.fetch("accept_token")) ? {"user" => auth.fetch("user")} : false
      }, log_in: ->(*) { true })
    end
    server
  end

  def handler(name)
    return ->(_node, params) { params.fetch("a") + params.fetch("b") } if name == "add_two_integers"
    return ->(node, _) { node.user_id } if name == "return_user_id"
    return ->(*) { raise TypeFerry::PublicError, name.delete_prefix("raise_public:") } if name.start_with?("raise_public:")
    return ->(*) { name.delete_prefix("return_const:") } if name.start_with?("return_const:")

    raise "unknown fixture handler: #{name}"
  end
end
