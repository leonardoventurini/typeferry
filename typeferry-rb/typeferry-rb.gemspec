# frozen_string_literal: true

require_relative "lib/typeferry/version"

Gem::Specification.new do |spec|
  spec.name = "typeferry-rb"
  spec.version = TypeFerry::VERSION
  spec.authors = ["Leonardo Venturini"]
  spec.summary = "Ruby server implementation of the TypeFerry protocol"
  spec.description = "A Rack-compatible Ruby server for TypeFerry RPC and realtime events."
  spec.homepage = "https://github.com/leonardoventurini/typeferry"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.3"

  spec.files = Dir.chdir(__dir__) do
    Dir["AGENTS.md", "README.md", "lib/**/*.rb", "sig/**/*.rbs"]
  end
  spec.require_paths = ["lib"]

  spec.add_dependency "jwt", "~> 3.1"
  spec.add_dependency "rack", "~> 3.2"
  spec.add_dependency "redis-client", "~> 0.26"
  spec.add_dependency "websocket-driver", "~> 0.8"

  spec.metadata = {
    "source_code_uri" => spec.homepage,
    "documentation_uri" => "#{spec.homepage}/blob/main/typeferry-rb/README.md"
  }
end
