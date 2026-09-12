# frozen_string_literal: true

require "timeout"
require "typeferry/transports/redis"
require_relative "../test_helper"

class RedisTest < Minitest::Test
  Publisher = Struct.new(:calls) do
    def call(*command)
      calls << command
      (command.first == "SMEMBERS") ? [] : 1
    end

    def close = nil
  end

  Subscriber = Struct.new(:events, :closed) do
    def call(*) = nil

    def next_event(*)
      event = events.shift
      raise RedisClient::ConnectionError, "lost subscription" if event == :disconnect

      event
    end

    def close = self.closed = true
  end

  Client = Struct.new(:subscriber) do
    def pubsub = subscriber
  end

  Socket = Struct.new(:uuid, :messages) do
    def send_text(payload) = messages << payload
  end

  def test_listener_reconnects_and_resubscribes_after_connection_loss
    publisher = Publisher.new([])
    first = Subscriber.new([:disconnect], false)
    payload = TypeFerry::EJSON.stringify({
      "event" => "changed", "channel" => "room", "message" => "delivered"
    })
    second = Subscriber.new([["pmessage", "events", "events", payload]], false)
    clients = Queue.new
    [publisher, Client.new(first), Client.new(second)].each { |client| clients << client }
    server = TypeFerry::Server.new
    socket = Socket.new("receiver", Queue.new)
    server.rooms.join(socket, "typeferry:room:changed")
    transport = TypeFerry::Transports::RedisTransport.new(server, client_factory: -> { clients.pop })

    transport.connect

    assert_equal "delivered", Timeout.timeout(2) { socket.messages.pop }
    assert first.closed
  ensure
    transport&.close
  end
end
