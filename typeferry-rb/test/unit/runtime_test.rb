# frozen_string_literal: true

require_relative "../test_helper"

class RuntimeTest < Minitest::Test
  FakeSocket = Struct.new(:uuid, :sent, :closed) do
    def send_text(value) = sent << value
    def close = self.closed = true
  end

  Validator = Struct.new(:result) do
    def safe_parse(_value) = result
  end

  def test_schema_runs_before_middleware_and_handler
    server = TypeFerry::Server.new
    failure = TypeFerry::ValidationResult.new(false, nil, [TypeFerry::ValidationIssue.new(["name"], "is required")])
    invoked = []
    server.add_method("validate", ->(*) { invoked << :handler }, schema: Validator.new(failure),
      middleware: [->(*) { invoked << :middleware }])

    error = assert_raises(TypeFerry::SchemaValidationError) { server.call("validate", {}) }

    assert_equal "Invalid Params: name: is required", error.message
    assert_empty invoked
  end

  def test_middleware_runs_in_registration_order
    server = TypeFerry::Server.new
    server.add_method("calculate", ->(_node, params) { params },
      middleware: [->(_node, value) { value + 1 }, ->(_node, value) { value * 2 }])

    assert_equal 4, server.call("calculate", 1)
  end

  def test_protected_method_fails_closed
    server = TypeFerry::Server.new
    server.add_method("secret", ->(*) { true }, protected: true)

    error = assert_raises(TypeFerry::PublicError) { server.call("secret") }

    assert_equal TypeFerry::Protocol::Errors::METHOD_FORBIDDEN, error.message
  end

  def test_context_is_restored_after_nested_call
    server = TypeFerry::Server.new
    node = TypeFerry::ClientNode.new(context: {"trace" => "outer"})
    server.add_method("context", ->(*) { TypeFerry::Context.current })

    result = server.call("context", node:)

    assert_equal node.context, result.fetch(:context)
    assert_nil TypeFerry::Context.current
  end

  def test_room_broadcast_excludes_client_uuid
    rooms = TypeFerry::RoomRegistry.new
    first = FakeSocket.new("one", [], false)
    second = FakeSocket.new("two", [], false)
    rooms.join(first, "room")
    rooms.join(second, "room")

    rooms.broadcast("room", "payload", exclude_uuid: "one")

    assert_empty first.sent
    assert_equal ["payload"], second.sent
  end

  def test_subscription_uses_protocol_room_name
    server = TypeFerry::Server.new
    socket = FakeSocket.new("one", [], false)
    node = TypeFerry::ClientNode.new(socket:)
    server.add_event("changed")

    result = server.call("rpc:on", {"events" => ["changed"], "channel" => "records"}, node:)

    assert_equal({"changed" => true}, result)
    assert server.rooms.include?(socket, "typeferry:records:changed")
  end

  def test_authoring_dsl_delegates_to_registration
    klass = Class.new do
      extend TypeFerry::Authoring

      namespace "greeting"
      method(:hello, public: true) { |_node, params| params.fetch("name") }
    end
    server = TypeFerry::Server.new
    server.register(klass.new)

    assert_equal "Ada", server.call("greeting.hello", {"name" => "Ada"})
  end

  def test_server_close_is_idempotent_and_closes_each_client_once
    server = TypeFerry::Server.new
    socket = FakeSocket.new("one", [], false)
    node = TypeFerry::ClientNode.new(socket:)
    server.add_client(node)

    assert server.close
    assert server.close
    assert socket.closed
    assert_empty server.clients_for_user("missing")
  end
end
