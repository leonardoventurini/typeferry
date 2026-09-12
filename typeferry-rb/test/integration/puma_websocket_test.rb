# frozen_string_literal: true

require "rbconfig"
require "monitor"
require "socket"
require "tempfile"
require "timeout"
require "websocket/driver"
require_relative "../test_helper"

class PumaWebSocketTest < Minitest::Test
  class Client
    attr_reader :url

    def initialize(port)
      @url = "ws://127.0.0.1:#{port}/typeferry-ws?uuid=puma-client"
      @socket = TCPSocket.new("127.0.0.1", port)
      @write_lock = Monitor.new
      @driver = WebSocket::Driver.client(self)
      @driver.set_header("Origin", "https://studio.test")
      @messages = Queue.new
      @driver.on(:message) { |event| @messages << TypeFerry::EJSON.parse(event.data) }
      @driver.start
      @reader = Thread.new { read_frames }
    end

    def write(bytes) = @write_lock.synchronize { @socket.write(bytes) }
    def send_text(payload) = @write_lock.synchronize { @driver.text(TypeFerry::EJSON.stringify(payload)) }
    def send_binary(payload) = @write_lock.synchronize { @driver.binary(payload) }
    def next_message = Timeout.timeout(5) { @messages.pop }

    def close
      @driver.close
      @socket.close unless @socket.closed?
      @reader.join(1)
    rescue IOError, SystemCallError
      nil
    end

    private

    def read_frames
      loop { @driver.parse(@socket.readpartial(16_384)) }
    rescue IOError, SystemCallError
      nil
    end
  end

  def setup
    @port = available_port
    config = File.expand_path("../support/puma_websocket.ru", __dir__)
    command = [RbConfig.ruby, Gem.bin_path("puma", "puma"), "--quiet", "--bind", "tcp://127.0.0.1:#{@port}", config]
    @output = Tempfile.new("typeferry-puma")
    @pid = Process.spawn(*command, out: @output, err: @output)
    wait_until_ready
  end

  def teardown
    @client&.close
    Process.kill("TERM", @pid) if @pid
    Process.wait(@pid) if @pid
    @output&.close!
  rescue Errno::ESRCH, Errno::ECHILD
    nil
  end

  def test_real_puma_upgrade_rpc_and_shutdown
    @client = Client.new(@port)

    assert_equal({"t" => "auth", "authenticated" => false}, @client.next_message)

    @client.send_text({"t" => "rpc", "id" => "request-1", "method" => "echo", "params" => {"ok" => true}})

    assert_equal({"t" => TypeFerry::Protocol::MessageType::RPC_RESPONSE, "id" => "request-1",
                  "result" => {"ok" => true}}, @client.next_message)
  end

  def test_binary_frames_are_ignored_and_concurrent_event_writes_remain_framed
    @client = Client.new(@port)
    @client.next_message
    @client.send_binary("ignored")
    @client.send_text({"t" => "rpc", "id" => "subscribe", "method" => "rpc:on",
      "params" => {"events" => ["changed"], "channel" => "room"}})
    assert_equal "subscribe", @client.next_message.fetch("id")

    @client.send_text({"t" => "rpc", "id" => "blast", "method" => "blast", "params" => {"count" => 20}})
    frames = 21.times.map { @client.next_message }
    events = frames.select { |frame| frame["t"] == "event" }
    response = frames.find { |frame| frame["id"] == "blast" }

    assert_equal 20, events.length
    assert_equal (0...20).to_a, events.map { |event| event.dig("params", "index") }.sort
    assert_equal 20, response.fetch("result")
  end

  private

  def available_port
    server = TCPServer.new("127.0.0.1", 0)
    server.local_address.ip_port
  ensure
    server&.close
  end

  def wait_until_ready
    Timeout.timeout(10) do
      loop do
        socket = TCPSocket.new("127.0.0.1", @port)
        socket.close
        break
      rescue Errno::ECONNREFUSED
        sleep 0.02
      end
    end
  rescue Timeout::Error
    @output.rewind
    flunk("Puma did not start:\n#{@output.read}")
  end
end
