# frozen_string_literal: true

require "base64"
require "openssl"
require "socket"
require "typeferry/auth/oauth"
require_relative "../test_helper"

class GoogleOAuthTest < Minitest::Test
  def test_code_exchange_and_id_token_verification_use_local_provider
    key = OpenSSL::PKey::RSA.generate(2048)
    now = Time.now.to_i
    token = JWT.encode({"sub" => "google-1", "aud" => "client-1", "iss" => "https://accounts.google.com",
      "iat" => now, "exp" => now + 60, "email" => "person@example.com", "email_verified" => true}, key, "RS256", {"kid" => "key-1"})
    jwk = {"kty" => "RSA", "kid" => "key-1", "use" => "sig", "alg" => "RS256",
           "n" => base64url(key.n.to_s(2)), "e" => base64url(key.e.to_s(2))}
    server, endpoint = mock_provider(token, jwk)
    config = TypeFerry::Auth::OAuth::GoogleConfig.new(client_id: "client-1", client_secret: "secret",
      token_endpoint: "#{endpoint}/token", jwks_endpoint: "#{endpoint}/certs")

    user = TypeFerry::Auth::OAuth::GoogleProvider.new(config).exchange_code("authorization-code")

    assert_equal "google-1", user.provider_id
    assert_equal "person@example.com", user.email
    assert user.email_verified
  ensure
    server&.close
    @provider_thread&.join
  end

  private

  def base64url(value) = Base64.urlsafe_encode64(value, padding: false)

  def mock_provider(token, jwk)
    server = TCPServer.new("127.0.0.1", 0)
    @provider_thread = Thread.new do
      2.times do
        socket = server.accept
        request_line = socket.gets
        headers = {}
        while (line = socket.gets) && line != "\r\n"
          name, value = line.split(":", 2)
          headers[name.downcase] = value.strip
        end
        socket.read(headers.fetch("content-length", "0").to_i)
        body = request_line.start_with?("POST /token ") ? JSON.generate({"id_token" => token}) : JSON.generate({"keys" => [jwk]})
        socket.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}")
        socket.close
      end
    end
    [server, "http://127.0.0.1:#{server.addr[1]}"]
  end
end
