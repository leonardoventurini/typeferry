# frozen_string_literal: true

require "typeferry/transports/websocket"
require_relative "../test_helper"

class WebSocketTest < Minitest::Test
  Socket = Struct.new(:uuid, :sent, :close_codes, :pongs) do
    def send_text(value) = sent << TypeFerry::EJSON.parse(value)
    def close(code = 1000) = close_codes << code
    def pong! = self.pongs += 1
  end

  def test_ping_is_answered_and_pong_updates_liveness
    socket = Socket.new("one", [], [], 0)
    dispatcher = TypeFerry::Transports::WebSocketDispatcher.new(TypeFerry::Server.new, socket)

    dispatcher.receive(TypeFerry::EJSON.stringify({"t" => TypeFerry::Protocol::MessageType::PING}))
    dispatcher.receive(TypeFerry::EJSON.stringify({"t" => TypeFerry::Protocol::MessageType::PONG}))

    assert_equal [{"t" => TypeFerry::Protocol::MessageType::PONG}], socket.sent
    assert_equal 1, socket.pongs
  end

  def test_close_removes_client_and_rooms_once
    server = TypeFerry::Server.new
    socket = Socket.new("one", [], [], 0)
    dispatcher = TypeFerry::Transports::WebSocketDispatcher.new(server, socket)
    server.add_event("changed")
    dispatcher.open
    server.call("rpc:on", {"events" => ["changed"], "channel" => "records"}, node: dispatcher.node)

    dispatcher.close
    dispatcher.close

    refute server.rooms.include?(socket, "typeferry:records:changed")
  end
end
