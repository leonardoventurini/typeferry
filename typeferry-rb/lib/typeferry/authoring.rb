# frozen_string_literal: true

module TypeFerry
  module Authoring
    def namespace(value)
      @typeferry_namespace = value
    end

    def protected_by_default
      @typeferry_defaults = typeferry_defaults.merge(protected: true)
    end

    def cache_by_default(max_age_ms: Protocol::DEFAULT_CACHE_MAX_AGE_MS)
      @typeferry_defaults = typeferry_defaults.merge(cache: true, max_age_ms:)
    end

    def method(ruby_name, name: nil, public: false, cache: nil, schema: nil, middleware: [], &implementation)
      send(:define_method, ruby_name, &implementation) if implementation
      options = typeferry_defaults.merge(schema:, middleware:)
      options[:protected] = false if public
      options[:cache] = cache unless cache.nil?
      wire_name = name || [@typeferry_namespace, ruby_name].compact.join(".")
      typeferry_methods << {ruby_name:, wire_name:, options:}
    end

    def typeferry_methods
      @typeferry_methods ||= []
    end

    private

    def typeferry_defaults
      @typeferry_defaults ||= {protected: false, cache: false}
    end
  end
end
