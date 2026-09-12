# frozen_string_literal: true

require_relative "types"

module TypeFerry
  module Auth
    def self.set_refresh_token_cookie(token, options, production: ENV["NODE_ENV"] == "production")
      secure = options.secure.nil? ? production : options.secure
      parts = ["#{options.name}=#{encode_cookie(token)}", "HttpOnly", "Path=#{options.path}",
        "Max-Age=#{options.max_age_days * 86_400}", "SameSite=#{options.same_site}"]
      parts << "Secure" if secure
      parts.join("; ")
    end

    def self.clear_refresh_token_cookie(name:, secure: nil, same_site: "Lax", path: "/",
      production: ENV["NODE_ENV"] == "production")
      parts = ["#{name}=", "HttpOnly", "Path=#{path}", "Max-Age=0", "SameSite=#{same_site}"]
      parts << "Secure" if secure.nil? ? production : secure
      parts.join("; ")
    end

    def self.get_refresh_token_from_cookie_header(header, name)
      return unless header

      match = header.match(/(?:\A|;\s*)#{Regexp.escape(name)}=([^;]*)/)
      return unless match

      match[1].to_s.gsub(/%([0-9A-Fa-f]{2})/) { [Integer(Regexp.last_match(1).to_s, 16)].pack("C") }
    end

    def self.encode_cookie(value)
      value.b.bytes.map do |byte|
        character = byte.chr
        character.match?(/[A-Za-z0-9!\x27()*._~-]/) ? character : format("%%%02X", byte)
      end.join
    end
    private_class_method :encode_cookie
  end
end
