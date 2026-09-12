# frozen_string_literal: true

require "uri"
require_relative "../runtime"

module TypeFerry
  module Transports
    class WebSocketDispatcher
      UUID_PATTERN = /[^a-zA-Z0-9-]/
      MAX_UUID_LENGTH = 64
      MAX_META_SIZE = 10_000

      attr_reader :node

      def initialize(server, socket, query: {}, handshake_authenticator: nil, handshake: {},
        auth_timeout_ms: Protocol::AUTH_TIMEOUT_MS)
        @server = server
        @socket = socket
        @query = query
        @handshake_authenticator = handshake_authenticator
        @handshake = handshake.freeze
        @auth_timeout_ms = auth_timeout_ms
        @node = ClientNode.new(socket:, uuid: sanitize_uuid(query["uuid"]))
        @node.meta = parse_meta(query["meta"])
        @node.server = server
        @closed = false
      end

      def open
        @server.add_client(node)
        result = authenticate_with_timeout
        if result && @handshake_authenticator
          node.authenticated = true
          node.set_context(result)
        end
        @server.redis_transport&.register_client(node) if node.authenticated
        node.emit_auth_result(node.authenticated)
      rescue
        node.authenticated = false
        node.emit_auth_result(false)
      end

      def receive(payload)
        frame = EJSON.parse(payload)
        return unless frame.is_a?(Hash)

        case frame["t"]
        when Protocol::MessageType::RPC
          rpc(frame)
        when Protocol::MessageType::RPC_VOID
          rpc_void(frame)
        when Protocol::MessageType::PONG
          @socket.pong! if @socket.respond_to?(:pong!)
        when Protocol::MessageType::PING
          @socket.send_text(EJSON.stringify({"t" => Protocol::MessageType::PONG}))
        end
      rescue JSON::ParserError, TypeError, ArgumentError
        nil
      end

      def close
        return if @closed

        @closed = true
        @server.delete_client(node)
      end

      def ping
        @socket.send_text(EJSON.stringify({"t" => Protocol::MessageType::PING}))
      end

      private

      def authenticate_with_timeout
        enabled = @handshake_authenticator || (@query["token"] && @server.instance_variable_get(:@auth))
        return unless enabled

        worker = Thread.new do
          if @handshake_authenticator
            @handshake_authenticator.call(node, @handshake)
          else
            @server.authenticate(node, {"token" => @query["token"]})
          end
        end
        return worker.value if worker.join(@auth_timeout_ms / 1000.0)

        worker.kill
        worker.join
        nil
      end

      def rpc(frame)
        id = frame["id"]
        method = @server.methods[frame["method"]]
        return respond(id, error: Protocol::Errors::METHOD_NOT_FOUND) unless method
        return respond(id, error: Protocol::Errors::METHOD_FORBIDDEN) if method.protected? && !node.authenticated

        respond(id, result: method.call(node, frame["params"]))
      rescue SchemaValidationError => exception
        respond(id, error: exception.message, errors: exception.errors)
      rescue PublicError => exception
        respond(id, error: exception.message)
      rescue
        respond(id, error: Protocol::Errors::INTERNAL_ERROR)
      end

      def rpc_void(frame)
        method = @server.methods[frame["method"]]
        return unless method
        return if method.protected? && !node.authenticated

        method.call(node, frame["params"])
      rescue
        nil
      end

      def respond(id, result: nil, error: nil, errors: nil)
        # @type var body: Hash[String, untyped]
        body = {"t" => Protocol::MessageType::RPC_RESPONSE, "id" => id}
        if error
          body["error"] = error
          body["errors"] = errors if errors
        else
          body["result"] = result
        end
        @socket.send_text(EJSON.stringify(body))
      end

      def sanitize_uuid(value)
        return SecureRandom.uuid unless value.is_a?(String) && !value.empty? && value.length <= MAX_UUID_LENGTH

        cleaned = value.gsub(UUID_PATTERN, "").slice(0, MAX_UUID_LENGTH).to_s
        cleaned.empty? ? SecureRandom.uuid : cleaned
      end

      def parse_meta(value)
        return {} unless value.is_a?(String)

        parsed = JSON.parse(value)
        return {} unless parsed.is_a?(Hash) && JSON.generate(parsed).bytesize <= MAX_META_SIZE

        parsed
      rescue JSON::ParserError, JSON::GeneratorError
        {}
      end
    end
  end
end
