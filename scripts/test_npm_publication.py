"""Contract tests for the operator-controlled npm publication workflow."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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


def test_package_validator_is_fail_closed_and_checks_exports() -> None:
    validator = (ROOT / "scripts/verify-npm-package.mjs").read_text(encoding="utf-8")

    assert "'publish', '--dry-run', '--json', '--access', 'public'" in validator
    assert "README.md" in validator
    assert "package.json" in validator
    assert "publishConfig" in validator
    assert "exports" in validator
    assert "dist/lit" in validator
    assert "process.exitCode = 1" in validator


def test_package_and_template_locks_use_final_identity() -> None:
    package_lock = json.loads(
        (ROOT / "typeferry-ts/package-lock.json").read_text(encoding="utf-8")
    )
    template_lock = json.loads(
        (ROOT / "template/package-lock.json").read_text(encoding="utf-8")
    )

    assert package_lock["name"] == "typeferry"
    assert package_lock["version"] == "0.6.0"
    assert package_lock["packages"][""]["name"] == "typeferry"
    assert "node_modules/typeferry" in template_lock["packages"]
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
