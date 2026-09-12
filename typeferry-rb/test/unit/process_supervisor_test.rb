# frozen_string_literal: true

require "rbconfig"
require "tempfile"
require "timeout"
require "typeferry/process_supervisor"
require_relative "../test_helper"

class ProcessSupervisorTest < Minitest::Test
  def setup
    @supervisor = TypeFerry::ProcessSupervisor.new(poll_interval: 0.005, termination_grace: 0.05)
  end

  def teardown
    @supervisor.close
  end

  def test_successful_process_returns_its_exit_status
    job = @supervisor.start(id: "success", command: [RbConfig.ruby, "-e", "exit 0"])

    result = job.wait(timeout: 2)

    assert_equal :exited, result.status
    assert_equal 0, result.exit_status
    assert result.success?
    refute @supervisor.active?("success")
  end

  def test_cancel_is_idempotent_and_terminates_the_process
    job = @supervisor.start(id: "cancel", command: [RbConfig.ruby, "-e", "sleep 30"])

    assert job.cancel
    assert job.cancel
    result = job.wait(timeout: 2)

    assert_equal :canceled, result.status
    refute result.success?
  end

  def test_timeout_terminates_the_process
    job = @supervisor.start(id: "timeout", command: [RbConfig.ruby, "-e", "sleep 30"], timeout: 0.02)

    result = job.wait(timeout: 2)

    assert_equal :timed_out, result.status
  end

  def test_cancel_terminates_descendants_in_the_child_process_group
    Tempfile.create("typeferry-descendant") do |file|
      script = <<~RUBY
        child = Process.spawn(#{RbConfig.ruby.inspect}, "-e", "sleep 30")
        File.write(ARGV.fetch(0), child.to_s)
        sleep 30
      RUBY
      job = @supervisor.start(id: "tree", command: [RbConfig.ruby, "-e", script, file.path])
      descendant_pid = wait_for_pid(file.path)

      job.cancel
      assert_equal :canceled, job.wait(timeout: 2).status

      assert_raises(Errno::ESRCH) { Process.kill(0, descendant_pid) }
    end
  end

  def test_duplicate_active_ids_are_rejected
    @supervisor.start(id: "same", command: [RbConfig.ruby, "-e", "sleep 30"])

    error = assert_raises(ArgumentError) do
      @supervisor.start(id: "same", command: [RbConfig.ruby, "-e", "exit 0"])
    end

    assert_equal "process job 'same' is already active", error.message
  end

  def test_close_cancels_and_joins_active_jobs
    job = @supervisor.start(id: "shutdown", command: [RbConfig.ruby, "-e", "sleep 30"])

    assert @supervisor.close

    assert_equal :canceled, job.result.status
    assert_raises(TypeFerry::ProcessSupervisor::ClosedError) do
      @supervisor.start(id: "late", command: [RbConfig.ruby, "-e", "exit 0"])
    end
  end

  private

  def wait_for_pid(path)
    Timeout.timeout(2) do
      loop do
        value = File.read(path)
        return Integer(value) unless value.empty?

        sleep 0.005
      end
    end
  end
end
