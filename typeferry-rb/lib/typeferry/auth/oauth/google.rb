# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require "jwt"

module TypeFerry
  module Auth
    module OAuth
      class GoogleConfig < Data.define(:client_id, :client_secret, :redirect_uri, :token_endpoint, :jwks_endpoint)
        def initialize(client_id:, client_secret:, redirect_uri: "postmessage",
          token_endpoint: "https://oauth2.googleapis.com/token",
          jwks_endpoint: "https://www.googleapis.com/oauth2/v3/certs")
          super
        end
      end

      class GoogleUser < Data.define(:provider_id, :provider, :email, :email_verified, :name, :picture, :raw)
      end

      class GoogleProvider
        attr_reader :name

        def initialize(config, http: Net::HTTP)
          @config = config
          @http = http
          @name = "google"
        end

        def exchange_code(code)
          response = post_form(@config.token_endpoint, {
            "code" => code,
            "client_id" => @config.client_id,
            "client_secret" => @config.client_secret,
            "redirect_uri" => @config.redirect_uri,
            "grant_type" => "authorization_code"
          })
          token = response["id_token"]
          raise ArgumentError, "Google OAuth response missing id_token" unless token.is_a?(String) && !token.empty?

          payload = verify(token)
          subject = payload["sub"]
          raise JWT::DecodeError, "Google ID token has no subject" unless subject.is_a?(String) && !subject.empty?

          GoogleUser.new(provider_id: subject, provider: name,
            email: string_value(payload["email"]), email_verified: payload["email_verified"] == true,
            name: string_value(payload["name"]), picture: string_value(payload["picture"]), raw: payload.freeze)
        end

        private

        def post_form(endpoint, form)
          uri = URI.parse(endpoint)
          request = Net::HTTP::Post.new(uri)
          request.set_form_data(form)
          parse_response(@http.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
            open_timeout: 10, read_timeout: 10) { |client| client.request(request) })
        end

        def verify(token)
          keys = get_json(@config.jwks_endpoint)
          payload, = JWT.decode(token, nil, true, algorithms: ["RS256"], jwks: keys,
            aud: @config.client_id, verify_aud: true, iss: ["accounts.google.com", "https://accounts.google.com"], verify_iss: true)
          payload
        end

        def get_json(endpoint)
          uri = URI.parse(endpoint)
          request = Net::HTTP::Get.new(uri)
          parse_response(@http.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
            open_timeout: 10, read_timeout: 10) { |client| client.request(request) })
        end

        def parse_response(response)
          raise IOError, "Google OAuth HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

          parsed = JSON.parse(response.body)
          raise TypeError, "Google OAuth returned a non-object response" unless parsed.is_a?(Hash)

          parsed
        end

        def string_value(value)
          value if value.is_a?(String)
        end
      end
    end
  end
end
