# frozen_string_literal: true

require "jwt"
require_relative "types"

module TypeFerry
  module Auth
    def self.sign_access_token(payload, config)
      JWT.encode(payload_to_wire(payload), config.secret, config.algorithm)
    end

    def self.verify_access_token(token, config, clock: Time)
      decoded, = JWT.decode(clean_token(token), config.secret, true,
        algorithm: config.algorithm, required_claims: %w[exp iat], verify_iat: true)
      payload = payload_from_wire(decoded)
      return if clock.now.to_i - payload.iat > config.access_token_expiry_minutes * 60

      payload
    rescue JWT::DecodeError, KeyError, TypeError, ArgumentError
      nil
    end

    def self.decode_token(token)
      decoded, = JWT.decode(clean_token(token), nil, false)
      payload_from_wire(decoded)
    rescue JWT::DecodeError, KeyError, TypeError, ArgumentError
      nil
    end

    def self.payload_to_wire(payload)
      result = {} #: Hash[String, untyped]
      result.merge!("userId" => payload.user_id, "sessionId" => payload.session_id, "iat" => payload.iat, "exp" => payload.exp)
      result["claims"] = payload.claims if payload.claims
      result
    end

    def self.payload_from_wire(payload)
      AccessTokenPayload.new(user_id: String(payload.fetch("userId")), session_id: String(payload.fetch("sessionId")),
        iat: Integer(payload.fetch("iat")), exp: Integer(payload.fetch("exp")),
        claims: payload["claims"].is_a?(Hash) ? payload["claims"] : nil)
    end

    def self.clean_token(token) = token.sub(/\ABearer\s+/i, "")

    private_class_method :payload_to_wire, :payload_from_wire, :clean_token
  end
end
