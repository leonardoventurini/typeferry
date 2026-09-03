"""Contract tests for the operator-controlled npm publication workflow."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
REDIS_HELPER = ROOT / "scripts" / "run-with-redis.sh"
MONGODB_HELPER = ROOT / "scripts" / "run-with-mongodb.sh"


def test_root_justfile_has_safe_npm_release_recipes() -> None:
    justfile = (ROOT / "justfile").read_text(encoding="utf-8")
    mise_config = (ROOT / ".mise.toml").read_text(encoding="utf-8")

    assert 'node = "24.19.0"' in mise_config
    assert 'npm = "11.17.0"' in mise_config
    assert "install-npm-toolchain:" in justfile
    assert "mise install" in justfile
    assert "verify-npm-release:" in justfile
    assert "publish-npm:" in justfile
    assert "verify-npm-release: install-npm-toolchain" in justfile
    assert "assert-npm-publish-state: install-npm-toolchain" in justfile
    assert "mise exec -- npm whoami" in justfile
    assert "mise exec -- node scripts/verify-npm-package.mjs" in justfile
    assert "mise exec -- npm publish --access public" in justfile
    assert "\n    npm " not in justfile
    assert " && npm " not in justfile
    assert "\n    node " not in justfile
    assert "git diff --quiet" in justfile
    assert "refs/heads/main" in justfile
    assert (
        "scripts/run-with-mongodb.sh ../scripts/run-with-redis.sh "
        "mise exec -- npm test"
    ) in justfile


def test_mongodb_helper_preserves_an_external_uri(tmp_path: Path) -> None:
    docker_log = tmp_path / "docker.log"
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        f'#!/usr/bin/env bash\necho "$*" >> "{docker_log}"\nexit 99\n',
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    expected_uri = "mongodb://mongo.example.test:27017"
    environment = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "TYPEFERRY_MONGODB_TEST_URI": expected_uri,
    }

    result = subprocess.run(
        [
            MONGODB_HELPER,
            "bash",
            "-c",
            f'test "$TYPEFERRY_MONGODB_TEST_URI" = "{expected_uri}"',
        ],
        cwd=ROOT,
        env=environment,
        check=False,
    )

    assert result.returncode == 0
    assert not docker_log.exists()


def test_redis_helper_preserves_an_external_redis_url(tmp_path: Path) -> None:
    docker_log = tmp_path / "docker.log"
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        f'#!/usr/bin/env bash\necho "$*" >> "{docker_log}"\nexit 99\n',
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    expected_url = "redis://redis.example.test:16379"
    environment = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "REDIS_URL": expected_url,
    }

    result = subprocess.run(
        [REDIS_HELPER, "bash", "-c", f'test "$REDIS_URL" = "{expected_url}"'],
        cwd=ROOT,
        env=environment,
        check=False,
    )

    assert result.returncode == 0
    assert not docker_log.exists()


def test_redis_helper_cleans_up_after_child_failure(tmp_path: Path) -> None:
    docker_log = tmp_path / "docker.log"
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  run) printf '%s\\n' 'temporary-redis-id' ;;
  port) printf '%s\\n' '127.0.0.1:49153' ;;
  exec) printf '%s\\n' 'PONG' ;;
  stop) ;;
  *) exit 98 ;;
esac
""",
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    environment = {
        key: value for key, value in os.environ.items() if key != "REDIS_URL"
    }
    environment.update(
        {
            "PATH": f"{tmp_path}:{os.environ['PATH']}",
            "DOCKER_LOG": str(docker_log),
        }
    )

    result = subprocess.run(
        [
            REDIS_HELPER,
            "bash",
            "-c",
            'test "$REDIS_URL" = "redis://127.0.0.1:49153" && exit 23',
        ],
        cwd=ROOT,
        env=environment,
        check=False,
    )

    assert result.returncode == 23
    docker_calls = docker_log.read_text(encoding="utf-8").splitlines()
    assert docker_calls == [
        "run --detach --rm --label typeferry.purpose=release-verification "
        "--publish 127.0.0.1::6379 redis:7-alpine",
        "port temporary-redis-id 6379/tcp",
        "exec temporary-redis-id redis-cli ping",
        "stop temporary-redis-id",
    ]


def test_redis_helper_cleans_up_after_interrupt(tmp_path: Path) -> None:
    docker_log = tmp_path / "docker.log"
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  run) printf '%s\n' 'temporary-redis-id' ;;
  port) printf '%s\n' '127.0.0.1:49153' ;;
  exec) printf '%s\n' 'PONG' ;;
  stop) ;;
  *) exit 98 ;;
esac
""",
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    environment = {
        key: value for key, value in os.environ.items() if key != "REDIS_URL"
    }
    environment.update(
        {
            "PATH": f"{tmp_path}:{os.environ['PATH']}",
            "DOCKER_LOG": str(docker_log),
        }
    )

    result = subprocess.run(
        [REDIS_HELPER, "bash", "-c", 'kill -TERM "$PPID"'],
        cwd=ROOT,
        env=environment,
        check=False,
    )

    assert result.returncode == 143
    assert docker_log.read_text(encoding="utf-8").splitlines()[-1] == (
        "stop temporary-redis-id"
    )


def test_package_validator_is_fail_closed_and_checks_exports() -> None:
    validator = (ROOT / "scripts/verify-npm-package.mjs").read_text(encoding="utf-8")

    assert "'pack', '--dry-run', '--json'" in validator
    assert "'publish', '--dry-run'" not in validator
    assert "README.md" in validator
    assert "package.json" in validator
    assert "publishConfig" in validator
    assert "exports" in validator
    assert "dist/lit" in validator
    assert "EXPECTED_VERSION" not in validator
    assert "report.version === manifestVersion" in validator
    assert "process.exitCode = 1" in validator


def test_release_docs_define_the_published_release() -> None:
    release_docs = (ROOT / "RELEASING.md").read_text(encoding="utf-8")

    assert "Published npm release" in release_docs
    assert "typeferry@0.8.0" in release_docs
    assert "create the annotated Git tag\n`v0.8.0`" in release_docs
    assert "No GitHub release is created" in release_docs
    assert "does not bump versions, create Git tags, push commits" in release_docs


def test_package_and_template_locks_use_final_identity() -> None:
    package_lock = json.loads(
        (ROOT / "typeferry-ts/package-lock.json").read_text(encoding="utf-8")
    )
    template_lock = json.loads(
        (ROOT / "template/package-lock.json").read_text(encoding="utf-8")
    )

    assert package_lock["name"] == "typeferry"
    assert package_lock["version"] == "0.8.0"
    assert package_lock["packages"][""]["name"] == "typeferry"
    assert package_lock["packages"][""]["engines"]["node"] == ">=24.19.0 <27"
    assert template_lock["packages"][""]["dependencies"]["typeferry"] == "^0.8.0"
    assert "node_modules/typeferry" in template_lock["packages"]
    assert template_lock["packages"]["node_modules/typeferry"]["version"] == "0.8.0"
    assert template_lock["packages"]["node_modules/typeferry"]["resolved"].startswith(
        "https://registry.npmjs.org/typeferry/-/typeferry-"
    )
    assert "node_modules/typeferry-ts" not in template_lock["packages"]


def test_active_code_has_no_temporary_package_imports() -> None:
    roots = [ROOT / "typeferry-ts/src", ROOT / "template/client", ROOT / "template/server"]
    stale_files: list[str] = []

    for source_root in roots:
        for source_file in source_root.rglob("*"):
            if not source_file.is_file() or source_file.suffix not in {".ts", ".tsx"}:
                continue
            if "typeferry-ts/" in source_file.read_text(encoding="utf-8"):
                stale_files.append(str(source_file.relative_to(ROOT)))

    assert stale_files == []
