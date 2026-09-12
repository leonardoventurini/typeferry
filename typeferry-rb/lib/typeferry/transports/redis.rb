# frozen_string_literal: true

require "redis-client"
require_relative "../runtime"

module TypeFerry
  module Transports
    # Dedicated-connection Redis transport for multi-process event propagation.
    class RedisTransport
      EVENTS_CHANNEL = "events"
      SERVERS_KEY = "typeferry:servers"
      DEFAULT_URL = "redis://127.0.0.1:6379"
      RECONNECT_DELAY = 0.1

      attr_reader :server, :url

      def initialize(server, url: ENV.fetch("REDIS_URL", DEFAULT_URL), client_factory: nil)
        @server = server
        @url = url
        @client_factory = client_factory || -> { RedisClient.config(url:).new_client }
        @publisher_lock = Mutex.new
        @lifecycle_lock = Mutex.new
        @condition = ConditionVariable.new
        @closed = false
        @ready = false
        server.attach_redis(self)
      end

      def connect
        @publisher = @client_factory.call
        publisher_call("PING")
        publisher_call("SADD", SERVERS_KEY, server.uuid)
        server.client_snapshot.each { |node| register_client(node) }
        @listener = Thread.new { listen }
        @listener.name = "typeferry-redis-listener" if @listener.respond_to?(:name=)
        wait_ready
        self
      end

      def wait_ready(timeout: 5.0)
        deadline = monotonic_now + timeout
        @lifecycle_lock.synchronize do
          @condition.wait(@lifecycle_lock, [deadline - monotonic_now, 0].max) until @ready || @closed || monotonic_now >= deadline
          raise RedisClient::ConnectionError, "TypeFerry Redis listener did not become ready" unless @ready
        end
        true
      end

      def publish(event:, channel:, message:, exclude_uuid: nil)
        payload = {"event" => event, "channel" => channel.to_s.empty? ? Protocol::NO_CHANNEL : channel, "message" => message}
        payload["excludeUuid"] = exclude_uuid if exclude_uuid
        publisher_call("PUBLISH", EVENTS_CHANNEL, EJSON.stringify(payload))
      end

      def register_client(node)
        publisher_call("SADD", clients_key, node.uuid)
        if node.user_id
          publisher_call("SADD", users_key, node.user_id)
        else
          rebuild_users
        end
      rescue RedisClient::Error
        nil
      end

      def remove_client(node)
        publisher_call("SREM", clients_key, node.uuid)
        rebuild_users
      rescue RedisClient::Error
        nil
      end

      def stats
        return {"clientCount" => 0, "userCount" => 0, "users" => []} unless @publisher

        servers = publisher_call("SMEMBERS", SERVERS_KEY)
        users = servers.flat_map { |identifier| publisher_call("SMEMBERS", "typeferry:users:#{identifier}") }.uniq.sort
        client_count = servers.sum { |identifier| publisher_call("SCARD", "typeferry:clients:#{identifier}").to_i }
        user_count = servers.sum { |identifier| publisher_call("SCARD", "typeferry:users:#{identifier}").to_i }
        {"clientCount" => client_count, "userCount" => user_count, "users" => users}
      end

      def close
        listener, subscriber = @lifecycle_lock.synchronize do
          return true if @closed

          @closed = true
          @condition.broadcast
          [@listener, @subscriber]
        end
        subscriber&.close
        listener&.join unless listener == Thread.current
        begin
          publisher_call("DEL", clients_key)
          publisher_call("DEL", users_key)
          publisher_call("SREM", SERVERS_KEY, server.uuid)
        ensure
          @publisher&.close
        end
        true
      rescue RedisClient::Error, IOError, SystemCallError
        @publisher&.close
        true
      end

      private

      def listen
        until closed?
          begin
            subscriber = @client_factory.call.pubsub
            @lifecycle_lock.synchronize { @subscriber = subscriber }
            subscriber.call("PSUBSCRIBE", EVENTS_CHANNEL)
            mark_ready
            consume(subscriber) until closed?
          rescue RedisClient::Error, IOError, SystemCallError
            interruptible_wait(RECONNECT_DELAY)
          ensure
            subscriber&.close
          end
        end
      end

      def consume(subscriber)
        frame = subscriber.next_event(0.1)
        return unless frame && frame[0] == "pmessage"

        route(frame[-1])
      end

      def route(payload)
        decoded = EJSON.parse(payload)
        return unless decoded.is_a?(Hash) && decoded["event"].is_a?(String) && decoded["message"].is_a?(String)

        channel = decoded["channel"].to_s
        channel = Protocol::NO_CHANNEL if channel.empty?
        excluded = decoded["excludeUuid"].is_a?(String) ? decoded["excludeUuid"] : nil
        server.rooms.broadcast("typeferry:#{channel}:#{decoded.fetch("event")}", decoded.fetch("message"), exclude_uuid: excluded)
      rescue JSON::ParserError, TypeError
        nil
      end

      def publisher_call(*command)
        @publisher_lock.synchronize { @publisher&.call(*command) }
      end

      def rebuild_users
        publisher_call("DEL", users_key)
        server_clients.filter_map(&:user_id).uniq.each { |user_id| publisher_call("SADD", users_key, user_id) }
      end

      def server_clients
        server.client_snapshot
      end

      def clients_key = "typeferry:clients:#{server.uuid}"
      def users_key = "typeferry:users:#{server.uuid}"
      def closed? = @lifecycle_lock.synchronize { @closed }

      def mark_ready
        @lifecycle_lock.synchronize do
          @ready = true
          @condition.broadcast
        end
      end

      def interruptible_wait(seconds)
        @lifecycle_lock.synchronize { @condition.wait(@lifecycle_lock, seconds) unless @closed }
      end

      def monotonic_now
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end
  end
end
