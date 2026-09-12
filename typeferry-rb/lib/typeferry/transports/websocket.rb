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

      def initialize(server, socket, query: {}, handshake_authenticator: nil, handshake: {})
        @server = server
        @socket = socket
        @query = query
        @handshake_authenticator = handshake_authenticator
        @handshake = handshake.freeze
        @node = ClientNode.new(socket:, uuid: sanitize_uuid(query["uuid"]))
        @node.server = server
        @closed = false
      end

      def open
        @server.add_client(node)
        result = if @handshake_authenticator
          @handshake_authenticator.call(node, @handshake)
        elsif @query["token"] && @server.instance_variable_get(:@auth)
          @server.authenticate(node, {"token" => @query["token"]})
        end
        if result && @handshake_authenticator
          node.authenticated = true
          node.set_context(result)
        end
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
    end
  end
end
