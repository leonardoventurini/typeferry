# frozen_string_literal: true

require "rack/mock"
require "timeout"
require "typeferry/transports/rack_websocket"
require_relative "../test_helper"

class RackWebSocketTest < Minitest::Test
  Dispatcher = Struct.new(:pings) do
    def ping = pings << true
  end

  Socket = Struct.new(:closes) do
    def close(code) = closes << code
  end

  def setup
    @transport = TypeFerry::Transports::RackWebSocket.new(TypeFerry::Server.new,
      origins: ["https://studio.test"])
  end

  def test_rejects_wrong_path_before_upgrade
    response = Rack::MockRequest.new(@transport).get("/wrong")

    assert_equal 404, response.status
  end

  def test_rejects_disallowed_origin_before_upgrade
    response = Rack::MockRequest.new(@transport).get(TypeFerry::Protocol::WEBSOCKET_PATH,
      "HTTP_ORIGIN" => "https://attacker.test")

    assert_equal 403, response.status
  end

  def test_requires_websocket_upgrade
    response = Rack::MockRequest.new(@transport).get(TypeFerry::Protocol::WEBSOCKET_PATH,
      "HTTP_ORIGIN" => "https://studio.test")

    assert_equal 426, response.status
  end

  def test_close_is_idempotent_and_rejects_new_connections
    assert @transport.close
    assert @transport.close

    response = Rack::MockRequest.new(@transport).get(TypeFerry::Protocol::WEBSOCKET_PATH)
    assert_equal 503, response.status
  end

  def test_heartbeat_closes_a_peer_that_misses_one_interval
    dispatcher = Dispatcher.new(Queue.new)
    socket = Socket.new(Queue.new)
    heartbeat = TypeFerry::Transports::WebSocketHeartbeat.new(dispatcher, socket, interval_ms: 10)

    heartbeat.start

    assert dispatcher.pings.pop
    assert_equal 1001, Timeout.timeout(1) { socket.closes.pop }
    assert heartbeat.stop
  end
end
