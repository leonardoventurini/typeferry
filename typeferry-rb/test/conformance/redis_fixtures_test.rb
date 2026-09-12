# frozen_string_literal: true

require "typeferry/transports/redis"
require_relative "../test_helper"

class RedisFixturesTest < Minitest::Test
  Publisher = Struct.new(:calls) do
    def call(*command)
      calls << command
      1
    end
  end

  Socket = Struct.new(:uuid, :sent) do
    def send_text(payload) = sent << payload
  end

  Dir[File.join(TypeFerryTest::FIXTURES, "redis", "*.case.json")].sort.each do |path|
    define_method("test_#{File.basename(path, ".case.json").tr("-", "_")}") do
      fixture = JSON.parse(File.read(path))
      (fixture["direction"] == "inbound") ? verify_inbound(fixture) : verify_publish(fixture)
    end
  end

  private

  def verify_publish(fixture)
    publisher = Publisher.new([])
    transport = TypeFerry::Transports::RedisTransport.new(TypeFerry::Server.new)
    transport.instance_variable_set(:@publisher, publisher)
    input = fixture.fetch("publish")

    transport.publish(event: input.fetch("event"), channel: input.fetch("channel"),
      message: input.fetch("message"), exclude_uuid: input["exclude_uuid"])

    command = publisher.calls.fetch(0)
    assert_equal ["PUBLISH", fixture.fetch("expected_redis_channel")], command.take(2)
    assert_equal fixture.fetch("expected_payload_decoded"), TypeFerry::EJSON.parse(command.fetch(2))
  end

  def verify_inbound(fixture)
    server = TypeFerry::Server.new
    socket = Socket.new("peer-2", [])
    expected = fixture.fetch("expected_propagate_call")
    server.rooms.join(socket, "typeferry:#{expected.fetch("channel")}:#{expected.fetch("event")}")
    transport = TypeFerry::Transports::RedisTransport.new(server)

    transport.send(:route, fixture.fetch("incoming_payload"))

    assert_equal [expected.fetch("payload")], socket.sent
  end
end
