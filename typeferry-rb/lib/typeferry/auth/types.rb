# frozen_string_literal: true

module TypeFerry
  module Auth
    class DeviceInfo < Data.define(:ip, :user_agent, :os, :browser, :device_type)
      def initialize(ip: nil, user_agent: nil, os: nil, browser: nil, device_type: nil)
        super
      end
    end

    class AccessTokenPayload < Data.define(:user_id, :session_id, :iat, :exp, :claims)
      def initialize(user_id:, session_id:, iat:, exp:, claims: nil)
        super
      end
    end

    class TokenPair < Data.define(:access_token, :refresh_token, :exp)
    end

    class CookieOptions < Data.define(:name, :max_age_days, :secure, :same_site, :path)
      def initialize(name:, max_age_days:, secure: nil, same_site: "Lax", path: "/")
        super
      end
    end

    class Config < Data.define(
      :secret, :algorithm, :access_token_expiry_minutes, :refresh_token_expiry_days,
      :rotation_grace_period_seconds, :login_rate_limit, :refresh_rate_limit
    )
      def initialize(secret:, algorithm: "HS256", access_token_expiry_minutes: 15,
        refresh_token_expiry_days: 14, rotation_grace_period_seconds: 15,
        login_rate_limit: nil, refresh_rate_limit: nil)
        raise ArgumentError, "algorithm must be HS256, HS384, or HS512" unless %w[HS256 HS384 HS512].include?(algorithm)
        raise ArgumentError, "secret must not be empty" if secret.empty?

        super
      end
    end

    class Session
      attr_accessor :id, :user_id, :family_id, :token, :expiration, :device_info,
        :is_revoked, :replaced_by, :used_at

      def initialize(id:, user_id:, family_id:, token:, expiration:, device_info: nil,
        is_revoked: false, replaced_by: nil, used_at: nil)
        @id = id
        @user_id = user_id
        @family_id = family_id
        @token = token
        @expiration = expiration
        @device_info = device_info
        @is_revoked = is_revoked
        @replaced_by = replaced_by
        @used_at = used_at
      end

      def initialize_copy(source)
        super
        @device_info = source.device_info
      end
    end
  end
end
