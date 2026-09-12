# frozen_string_literal: true

require "timeout"
require "typeferry/transports/redis"
require_relative "../test_helper"

class RedisTransportTest < Minitest::Test
  Socket = Struct.new(:uuid, :messages) do
    def send_text(payload) = messages << payload
    def close = nil
  end

  def setup
    skip "REDIS_URL is required for live Redis integration" unless ENV["REDIS_URL"]

    @servers = [TypeFerry::Server.new, TypeFerry::Server.new]
    @transports = @servers.map { |server| TypeFerry::Transports::RedisTransport.new(server, url: ENV.fetch("REDIS_URL")).connect }
  end

  def teardown
    @transports&.each(&:close)
  end

  def test_two_servers_propagate_once_and_honor_originator_exclusion
    receiving = Socket.new("receiver", Queue.new)
    excluded = Socket.new("excluded", Queue.new)
    room = "typeferry:room:changed"
    @servers.fetch(1).rooms.join(receiving, room)
    @servers.fetch(1).rooms.join(excluded, room)
    event = @servers.fetch(0).add_event("changed", cluster: true, exclude_originator: true)

    event.emit("room", {"uuid" => "excluded", "value" => 1})

    payload = TypeFerry::EJSON.parse(Timeout.timeout(2) { receiving.messages.pop })
    assert_equal 1, payload.dig("params", "value")
    assert_raises(ThreadError) { excluded.messages.pop(true) }
    sleep 0.1
    assert_raises(ThreadError) { receiving.messages.pop(true) }
  end

  def test_cluster_stats_and_cleanup_keys
    first = TypeFerry::ClientNode.new(uuid: "client-a", context: {"user" => {"_id" => "user-a"}})
    first.authenticated = true
    second = TypeFerry::ClientNode.new(uuid: "client-b", context: {"user" => {"_id" => "user-b"}})
    second.authenticated = true
    @servers.fetch(0).add_client(first)
    @servers.fetch(1).add_client(second)

    stats = @transports.fetch(0).stats

    assert_equal 2, stats.fetch("clientCount")
    assert_equal 2, stats.fetch("userCount")
    assert_equal ["user-a", "user-b"], stats.fetch("users")
  end

  def test_close_removes_server_registration_and_owned_sets
    transport = @transports.fetch(0)
    identifier = transport.server.uuid
    transport.server.add_client(TypeFerry::ClientNode.new(uuid: "cleanup-client"))

    transport.close

    probe = RedisClient.config(url: ENV.fetch("REDIS_URL")).new_client
    refute_includes probe.call("SMEMBERS", "typeferry:servers"), identifier
    assert_equal 0, probe.call("EXISTS", "typeferry:clients:#{identifier}")
    assert_equal 0, probe.call("EXISTS", "typeferry:users:#{identifier}")
    probe.close
  end
end
