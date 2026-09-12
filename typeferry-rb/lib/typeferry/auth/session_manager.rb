# frozen_string_literal: true

require "securerandom"
require_relative "jwt"

module TypeFerry
  module Auth
    class InMemorySessionManager
      attr_reader :config

      def initialize(config, clock: -> { Time.now.to_f })
        @config = config
        @clock = clock
        @sessions = {} #: Hash[String, Session]
        @lock = Mutex.new
      end

      def create_session(user_id, device_info = nil)
        @lock.synchronize do
          family_id = fresh_id
          token = fresh_id
          session_id = fresh_id
          @sessions[token] = build_session(session_id, user_id, family_id, token, device_info)
          build_token_pair(token, user_id, session_id)
        end
      end

      def refresh_session(refresh_token, device_info = nil)
        @lock.synchronize do
          session = @sessions[refresh_token]
          return unless session && !session.is_revoked && now_seconds <= session.expiration
          return reused_token(session) if session.replaced_by

          rotate(session, device_info)
        end
      end

      def revoke_session(session_id)
        @lock.synchronize do
          session = @sessions.values.find { |candidate| candidate.id == session_id }
          session.is_revoked = true if session
          !session.nil?
        end
      end

      def revoke_family(family_id)
        @lock.synchronize { revoke_family_unlocked(family_id) }
      end

      def user_sessions(user_id)
        @lock.synchronize do
          @sessions.values.select do |session|
            session.user_id == user_id && !session.is_revoked && !session.replaced_by && session.expiration > now_seconds
          end.map(&:dup).freeze
        end
      end

      def revoke_all_user_sessions(user_id, except_family_id: nil)
        @lock.synchronize do
          selected = @sessions.values.select do |session|
            session.user_id == user_id && !session.is_revoked && session.family_id != except_family_id
          end
          selected.each { |session| session.is_revoked = true }
          selected.length
        end
      end

      def session_for(refresh_token) = @lock.synchronize { @sessions[refresh_token]&.dup }
      def size = @lock.synchronize { @sessions.size }

      def cleanup
        @lock.synchronize { @sessions.delete_if { |_token, session| session.is_revoked || session.expiration <= now_seconds } }
      end

      def close
        @lock.synchronize { @sessions.clear }
        true
      end

      private

      def rotate(session, device_info)
        token = fresh_id
        session_id = fresh_id
        @sessions[token] = build_session(session_id, session.user_id, session.family_id, token, device_info)
        session.replaced_by = token
        session.used_at = now_milliseconds
        build_token_pair(token, session.user_id, session_id)
      end

      def reused_token(session)
        if !session.used_at || now_milliseconds - session.used_at > config.rotation_grace_period_seconds * 1_000
          revoke_family_unlocked(session.family_id)
          return
        end

        replacement = @sessions[session.replaced_by]
        build_token_pair(replacement.token, replacement.user_id, replacement.id) if replacement && !replacement.is_revoked
      end

      def revoke_family_unlocked(family_id)
        selected = @sessions.values.select { |session| session.family_id == family_id && !session.is_revoked }
        selected.each { |session| session.is_revoked = true }
        selected.length
      end

      def build_session(id, user_id, family_id, token, device_info)
        Session.new(id:, user_id:, family_id:, token:,
          expiration: now_seconds + config.refresh_token_expiry_days * 86_400,
          device_info:, is_revoked: false)
      end

      def build_token_pair(refresh_token, user_id, session_id)
        issued_at = now_seconds
        expiration = issued_at + config.access_token_expiry_minutes * 60
        payload = AccessTokenPayload.new(user_id:, session_id:, iat: issued_at, exp: expiration)
        TokenPair.new(access_token: Auth.sign_access_token(payload, config), refresh_token:, exp: expiration)
      end

      def now_seconds = @clock.call.to_i
      def now_milliseconds = @clock.call * 1_000
      def fresh_id = SecureRandom.uuid
    end
  end
end
