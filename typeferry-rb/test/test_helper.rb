# frozen_string_literal: true

require "minitest/autorun"
require "typeferry"

module TypeFerryTest
  ROOT = File.expand_path("../..", __dir__)
  FIXTURES = File.join(ROOT, "docs", "conformance", "fixtures")
end
