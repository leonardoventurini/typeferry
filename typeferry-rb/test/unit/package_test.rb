# frozen_string_literal: true

require_relative "../test_helper"

class PackageTest < Minitest::Test
  def test_version_is_exposed
    refute_empty TypeFerry::VERSION
  end

  def test_shared_fixtures_are_resolved_from_the_repository
    assert_path_exists TypeFerryTest::FIXTURES
    assert_path_exists File.join(TypeFerryTest::FIXTURES, "ejson", "001-null.case.json")
  end
end
