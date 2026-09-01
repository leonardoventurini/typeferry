#!/usr/bin/env python3
"""Regression tests for the release bump helper."""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).with_name("bump-versions.py")
MODULE_NAME = "bump_versions_under_test"


def load_bump_module() -> types.ModuleType:
    """Load the hyphenated bump script as a regular Python module."""

    spec = importlib.util.spec_from_file_location(MODULE_NAME, SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {SCRIPT_PATH}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


BUMP_MODULE = load_bump_module()


class FilesInRangeTests(unittest.TestCase):
    """File-range detection controls whether publishable packages are bumped."""

    def test_bootstrap_range_reads_files_from_commit_history(self) -> None:
        """First release bootstrap must not compare the clean worktree to HEAD."""

        commands: list[list[str]] = []

        def fake_check_output(args: list[str], *, cwd: Path, text: bool) -> str:
            commands.append(args)
            self.assertEqual(BUMP_MODULE.REPO_ROOT, cwd)
            self.assertTrue(text)
            return "\n".join(
                [
                    "typeferry-ts/src/index.ts",
                    "",
                    "typeferry-ts/src/index.ts",
                    "README.md",
                ]
            )

        with patch.object(
            BUMP_MODULE.subprocess,
            "check_output",
            side_effect=fake_check_output,
        ):
            files = BUMP_MODULE.files_in_range(None, "HEAD")

        self.assertEqual(["README.md", "typeferry-ts/src/index.ts"], files)
        self.assertEqual(
            [["git", "log", "--format=", "--name-only", "HEAD"]],
            commands,
        )

    def test_anchored_range_reads_files_from_git_diff(self) -> None:
        """Subsequent release scans should remain anchored to the last release."""

        commands: list[list[str]] = []

        def fake_check_output(args: list[str], *, cwd: Path, text: bool) -> str:
            commands.append(args)
            self.assertEqual(BUMP_MODULE.REPO_ROOT, cwd)
            self.assertTrue(text)
            return "typeferry-py/pyproject.toml\n"

        with patch.object(
            BUMP_MODULE.subprocess,
            "check_output",
            side_effect=fake_check_output,
        ):
            files = BUMP_MODULE.files_in_range("abc123", "HEAD")

        self.assertEqual(["typeferry-py/pyproject.toml"], files)
        self.assertEqual(
            [["git", "diff", "--name-only", "abc123..HEAD"]],
            commands,
        )


if __name__ == "__main__":
    unittest.main()
