# frozen_string_literal: true

require "typeferry/auth"
require_relative "../test_helper"

class SessionManagerTest < Minitest::Test
  def setup
    @now = 1_800_000_000.0
    @config = TypeFerry::Auth::Config.new(secret: "s" * 32, rotation_grace_period_seconds: 15)
    @manager = TypeFerry::Auth::InMemorySessionManager.new(@config, clock: -> { @now })
  end

  def teardown
    @manager.close
  end

  def test_create_rotate_and_graceful_concurrent_reuse
    original = @manager.create_session("user-1")
    barrier = Queue.new
    results = 8.times.map do
      Thread.new do
        barrier.pop
        @manager.refresh_session(original.refresh_token)
      end
    end
    8.times { barrier << true }
    pairs = results.map(&:value)

    assert pairs.all?
    assert_equal 1, pairs.map(&:refresh_token).uniq.length
    assert_equal 1, @manager.user_sessions("user-1").length
  end

  def test_reuse_outside_grace_revokes_entire_family
    original = @manager.create_session("user-1")
    replacement = @manager.refresh_session(original.refresh_token)
    @now += 16

    assert_nil @manager.refresh_session(original.refresh_token)
    assert_nil @manager.refresh_session(replacement.refresh_token)
    assert_empty @manager.user_sessions("user-1")
  end

  def test_revoke_queries_cleanup_and_family_exception
    first = @manager.create_session("user-1")
    second = @manager.create_session("user-1")
    kept_family = @manager.session_for(first.refresh_token).family_id

    assert_equal 1, @manager.revoke_all_user_sessions("user-1", except_family_id: kept_family)
    assert_nil @manager.refresh_session(second.refresh_token)
    assert @manager.revoke_session(TypeFerry::Auth.decode_token(first.access_token).session_id)

    @manager.cleanup
    assert_equal 0, @manager.size
  end

  def test_expired_refresh_token_is_rejected_and_cleaned
    pair = @manager.create_session("user-1")
    @now += 15 * 86_400

    assert_nil @manager.refresh_session(pair.refresh_token)
    @manager.cleanup
    assert_equal 0, @manager.size
  end
end
