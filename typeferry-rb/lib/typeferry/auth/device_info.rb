# frozen_string_literal: true

require_relative "types"

module TypeFerry
  module Auth
    def self.parse_device_info(headers, remote_address: nil)
      return DeviceInfo.new unless headers

      user_agent = header(headers, "user-agent")
      ip = header(headers, "x-forwarded-for") || remote_address
      return DeviceInfo.new(ip:) unless user_agent

      DeviceInfo.new(ip:, user_agent:, **user_agent_details(user_agent))
    end

    def self.header(headers, name)
      value = headers[name] || headers[name.downcase] || headers[name.upcase]
      value if value.is_a?(String) && !value.empty?
    end
    private_class_method :header

    def self.user_agent_details(value)
      case value
      when /iPhone.*OS ([\d_]+)/
        version = Regexp.last_match(1).to_s.tr("_", ".")
        {os: "iOS #{version}", browser: safari(value), device_type: "mobile"}
      when /iPad.*OS ([\d_]+)/
        version = Regexp.last_match(1).to_s.tr("_", ".")
        {os: "iOS #{version}", browser: safari(value), device_type: "tablet"}
      when /Android ([\d.]+)/
        {os: "Android #{Regexp.last_match(1)}", browser: chrome(value), device_type: value.include?("Mobile") ? "mobile" : "tablet"}
      when /Windows NT ([\d.]+)/
        {os: "Windows #{Regexp.last_match(1)}", browser: desktop_browser(value), device_type: "desktop"}
      when /Mac OS X ([\d_]+)/
        {os: "macOS #{Regexp.last_match(1).to_s.tr("_", ".")}", browser: desktop_browser(value), device_type: "desktop"}
      else
        {os: nil, browser: desktop_browser(value), device_type: "desktop"}
      end
    end
    private_class_method :user_agent_details

    def self.safari(value)
      version = value[/Version\/([\d.]+)/, 1]
      version ? "Mobile Safari #{version}" : "Mobile Safari"
    end
    private_class_method :safari

    def self.chrome(value)
      version = value[/(?:Chrome|CriOS)\/([\d.]+)/, 1]
      version ? "Chrome #{version}" : nil
    end
    private_class_method :chrome

    def self.desktop_browser(value)
      return "Edge #{Regexp.last_match(1)}" if value =~ /Edg\/([\d.]+)/
      return "Chrome #{Regexp.last_match(1)}" if value =~ /Chrome\/([\d.]+)/
      return "Firefox #{Regexp.last_match(1)}" if value =~ /Firefox\/([\d.]+)/
      return "Safari #{Regexp.last_match(1)}" if value =~ /Version\/([\d.]+).*Safari\//

      nil
    end
    private_class_method :desktop_browser
  end
end
