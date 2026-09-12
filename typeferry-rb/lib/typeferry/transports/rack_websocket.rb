# frozen_string_literal: true

require "rack"
require "monitor"
require "uri"
require "websocket/driver"
require_relative "websocket"

module TypeFerry
  module Transports
    # Puma-certified Rack hijack adapter for the TypeFerry WebSocket dispatcher.
    class RackWebSocket
      RESPONSE_HEADERS = {"content-type" => "text/plain; charset=utf-8"}.freeze

      def initialize(server, origins: nil, handshake_authenticator: nil)
        @server = server
        @origins = origins&.to_set&.freeze
        @handshake_authenticator = handshake_authenticator
        @connections = Set.new
        @lock = Mutex.new
        @closed = false
      end

      def call(environment)
        return response(404, "") unless environment["PATH_INFO"] == Protocol::WEBSOCKET_PATH
        return response(503, "WebSocket transport is shutting down") if closed?
        return response(403, "WebSocket origin is not allowed") unless origin_allowed?(environment["HTTP_ORIGIN"])
        return response(426, "WebSocket upgrade required") unless WebSocket::Driver.websocket?(environment)
        return response(501, "Rack hijacking is unavailable") unless environment["rack.hijack"]

        connection = RackWebSocketConnection.new(
          environment,
          @server,
          handshake_authenticator: @handshake_authenticator,
          on_close: method(:remove_connection)
        )
        @lock.synchronize { @connections << connection }
        connection.start

        [-1, {}, []]
      rescue => exception
        warn("TypeFerry WebSocket upgrade failed: #{exception.class}: #{exception.message}")
        connection&.close
        response(500, "WebSocket upgrade failed")
      end

      def close
        connections = @lock.synchronize do
          return true if @closed

          @closed = true
          @connections.to_a
        end
        connections.each(&:close)
        true
      end

      private

      def closed?
        @lock.synchronize { @closed }
      end

      def origin_allowed?(origin)
        !@origins || !origin || @origins.include?(origin)
      end

      def remove_connection(connection)
        @lock.synchronize { @connections.delete(connection) }
      end

      def response(status, body)
        headers = RESPONSE_HEADERS.merge("content-length" => body.bytesize.to_s)
        [status, headers, [body]]
      end
    end

    # Owns one hijacked Puma socket and serializes all driver and IO access.
    class RackWebSocketConnection
      READ_SIZE = 16_384
      MAX_FRAME_BYTES = 1_048_576

      attr_reader :env, :url, :uuid

      def initialize(environment, server, handshake_authenticator:, on_close:)
        @env = environment
        @url = websocket_url(environment)
        @uuid = SecureRandom.uuid
        @on_close = on_close
        # websocket-driver synchronously calls #write from #text/#close.
        @write_lock = Monitor.new
        @state_lock = Mutex.new
        @closed = false
        @driver = WebSocket::Driver.rack(self, max_length: MAX_FRAME_BYTES)
        @dispatcher = WebSocketDispatcher.new(
          server,
          self,
          query: query_values(environment["QUERY_STRING"]),
          handshake_authenticator:,
          handshake: handshake_snapshot(environment)
        )
        @heartbeat = WebSocketHeartbeat.new(@dispatcher, self)
        install_callbacks
      end

      def start
        @env.fetch("rack.hijack").call
        @io = @env.fetch("rack.hijack_io")
        @driver.start
        @reader = Thread.new { read_frames }
        @reader.name = "typeferry-websocket-reader" if @reader.respond_to?(:name=)
        @reader
      end

      def write(bytes)
        @write_lock.synchronize { @io&.write(bytes) }
      end

      def send_text(payload)
        @write_lock.synchronize { @driver.text(payload) } unless closed?
      end

      def pong!
        @heartbeat.mark_pong
      end

      def close(code = 1000)
        should_close = @state_lock.synchronize do
          next false if @closed

          @closed = true
          true
        end
        return unless should_close

        @heartbeat.stop
        @write_lock.synchronize { @driver.close("", code) }
        @io&.close unless @io&.closed?
        @reader&.join unless @reader == Thread.current
      rescue IOError, SystemCallError
        nil
      ensure
        finish if should_close
      end

      private

      def closed?
        @state_lock.synchronize { @closed }
      end

      def install_callbacks
        @driver.on(:open) do
          @dispatcher.open
          @heartbeat.start
        end
        @driver.on(:message) { |event| @dispatcher.receive(event.data) unless event.data.encoding == Encoding::BINARY }
        @driver.on(:close) { close }
        @driver.on(:error) { close }
      end

      def read_frames
        loop { @driver.parse(@io.readpartial(READ_SIZE)) }
      rescue IOError, SystemCallError
        nil
      ensure
        close
      end

      def finish
        @dispatcher.close
        @on_close.call(self)
      end

      def websocket_url(environment)
        scheme = (environment["rack.url_scheme"] == "https") ? "wss" : "ws"
        "#{scheme}://#{environment.fetch("HTTP_HOST")}#{environment.fetch("REQUEST_URI")}"
      end

      def query_values(source)
        URI.decode_www_form(source.to_s).to_h
      rescue ArgumentError
        {}
      end

      def handshake_snapshot(environment)
        # @type var headers: Hash[String, String]
        headers = {}
        environment.each do |name, value|
          headers[name.delete_prefix("HTTP_").downcase.tr("_", "-")] = value.to_s if name.start_with?("HTTP_")
        end
        {path: environment["PATH_INFO"].to_s, headers: headers.freeze,
         query: query_values(environment["QUERY_STRING"]).freeze}.freeze
      end
    end

    # Application-level liveness worker required by protocol revision 1.
    class WebSocketHeartbeat
      def initialize(dispatcher, socket, interval_ms: Protocol::PING_INTERVAL_MS)
        @dispatcher = dispatcher
        @socket = socket
        @interval = interval_ms / 1000.0
        @lock = Mutex.new
        @condition = ConditionVariable.new
        @pong_received = true
        @stopped = false
      end

      def start
        @thread = Thread.new { run }
        @thread.name = "typeferry-websocket-heartbeat" if @thread.respond_to?(:name=)
        @thread
      end

      def mark_pong
        @lock.synchronize { @pong_received = true }
      end

      def stop
        thread = @lock.synchronize do
          @stopped = true
          @condition.broadcast
          @thread
        end
        thread&.join unless thread == Thread.current
        true
      end

      private

      def run
        loop do
          state = @lock.synchronize do
            @condition.wait(@lock, @interval)
            if @stopped
              :stopped
            else
              value = @pong_received ? :healthy : :stale
              @pong_received = false
              value
            end
          end
          break if state == :stopped
          if state == :stale
            @socket.close(1001)
            break
          end

          @dispatcher.ping
        end
      end
    end
  end
end
