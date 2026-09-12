# frozen_string_literal: true

require "rubygems/package"

artifact = Dir[File.expand_path("../../pkg/typeferry-rb-*.gem", __dir__)].max
abort "gem artifact not found" unless artifact

allowed = %r{\A(?:AGENTS\.md|README\.md|lib/.+\.rb|sig/.+\.rbs)\z}
files = Gem::Package.new(artifact).spec.files
unexpected = files.reject { |path| allowed.match?(path) }
abort "unexpected gem files: #{unexpected.join(", ")}" unless unexpected.empty?
