#!/usr/bin/env python3
"""Conventional Commits → per-package semver bumps.

Reads the commit range ``$BASE..$HEAD`` (defaults to ``last-release-commit..HEAD``),
classifies each commit, computes the highest bump level per package
(bifrost-ts / bifrost-py / bifrost-rs), and rewrites the matching
manifest. Prints a JSON summary on stdout for downstream tooling
(release-bump.yml uses it to construct the commit message).

Usage::

    scripts/bump-versions.py            # auto-detect base; bump if needed
    scripts/bump-versions.py BASE HEAD  # explicit range
    scripts/bump-versions.py --dry-run  # report only, don't edit

Exit codes:

* 0 — success (whether or not bumps were applied)
* 2 — usage error
* anything else — an unhandled exception
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Package:
    name: str
    path: str
    manifest: Path
    aliases: tuple[str, ...]


PACKAGES: tuple[Package, ...] = (
    Package(
        name="bifrost-ts",
        path="bifrost-ts",
        manifest=REPO_ROOT / "bifrost-ts/package.json",
        aliases=("ts", "bifrost-ts"),
    ),
    Package(
        name="bifrost-py",
        path="bifrost-py",
        manifest=REPO_ROOT / "bifrost-py/pyproject.toml",
        aliases=("py", "bifrost-py"),
    ),
    Package(
        name="bifrost-rs",
        path="bifrost-rs",
        manifest=REPO_ROOT / "bifrost-rs/Cargo.toml",
        aliases=("rs", "bifrost-rs"),
    ),
)

LEVEL_RANK = {"patch": 1, "minor": 2, "major": 3}

# Conventional Commits subject regex.
COMMIT_RE = re.compile(
    r"^(?P<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)"
    r"(?:\((?P<scope>[^)]+)\))?"
    r"(?P<breaking>!)?"
    r": "
)

# Recognize the bot's own commits so we don't loop on them.
RELEASE_COMMIT_PREFIX = "chore(release):"


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=REPO_ROOT, text=True).strip()


def find_last_release_sha() -> str | None:
    """Return the SHA of the most recent ``chore(release):`` commit on HEAD."""

    out = subprocess.run(
        ["git", "log", "--format=%H%x09%s"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    for line in out.stdout.splitlines():
        sha, subject = line.split("\t", 1)
        if subject.startswith(RELEASE_COMMIT_PREFIX):
            return sha
    return None


@dataclass
class Commit:
    sha: str
    subject: str
    body: str

    def conv_type(self) -> str | None:
        m = COMMIT_RE.match(self.subject)
        return m.group("type") if m else None

    def scope(self) -> str | None:
        m = COMMIT_RE.match(self.subject)
        return m.group("scope") if m else None

    def is_breaking(self) -> bool:
        m = COMMIT_RE.match(self.subject)
        if m and m.group("breaking"):
            return True
        return "BREAKING CHANGE:" in self.body or "BREAKING-CHANGE:" in self.body

    def bump_level(self) -> str | None:
        if self.is_breaking():
            return "major"
        t = self.conv_type()
        if t == "feat":
            return "minor"
        if t == "fix":
            return "patch"
        return None


def commits_in_range(base: str | None, head: str) -> list[Commit]:
    rev_range = f"{base}..{head}" if base else head
    out = subprocess.check_output(
        ["git", "log", "--format=%H%x1f%s%x1f%b%x1e", rev_range],
        cwd=REPO_ROOT,
        text=True,
    )
    commits: list[Commit] = []
    for raw in out.split("\x1e"):
        if not raw.strip():
            continue
        parts = raw.strip().split("\x1f", 2)
        if len(parts) < 2:
            continue
        sha, subject = parts[0], parts[1]
        body = parts[2] if len(parts) > 2 else ""
        commits.append(Commit(sha=sha, subject=subject, body=body))
    return commits


def files_in_range(base: str | None, head: str) -> list[str]:
    if base:
        out = subprocess.check_output(
            ["git", "diff", "--name-only", f"{base}..{head}"],
            cwd=REPO_ROOT,
            text=True,
        )
    else:
        # First-run bootstrap has no release commit anchor. `git diff HEAD`
        # compares the worktree to HEAD and returns no files in CI, even
        # though `git log HEAD` finds the full commit set. Read touched files
        # from the commits themselves so path-based package detection works.
        out = subprocess.check_output(
            ["git", "log", "--format=", "--name-only", head],
            cwd=REPO_ROOT,
            text=True,
        )
    return sorted({line for line in out.splitlines() if line.strip()})


# ---------------------------------------------------------------------------
# Bump computation
# ---------------------------------------------------------------------------


def normalize_scope(scope: str) -> str:
    return scope.lower().strip()


def compute_bumps(commits: list[Commit], files: list[str]) -> dict[str, str]:
    """Map ``package_name`` → bump level for every package needing a bump."""

    result: dict[str, str] = {}
    for pkg in PACKAGES:
        prefix = f"{pkg.path}/"
        path_touched = any(f == pkg.path or f.startswith(prefix) for f in files)
        if not path_touched:
            continue

        best: str | None = None
        for c in commits:
            if c.subject.startswith(RELEASE_COMMIT_PREFIX):
                continue
            level = c.bump_level()
            if level is None:
                continue
            scope = c.scope()
            if scope:
                normalized = normalize_scope(scope)
                if normalized not in pkg.aliases:
                    continue  # scoped to a different package — ignore
            # Unscoped commits apply to every package whose path was touched.
            if best is None or LEVEL_RANK[level] > LEVEL_RANK[best]:
                best = level
        if best is not None:
            result[pkg.name] = best
    return result


def bump_version(current: str, level: str) -> str:
    parts = current.split(".")
    if len(parts) != 3:
        raise ValueError(f"unsupported version format: {current!r}")
    major, minor, patch = (int(p) for p in parts)
    if level == "major":
        return f"{major + 1}.0.0"
    if level == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


# ---------------------------------------------------------------------------
# Manifest editing
# ---------------------------------------------------------------------------


def read_version(pkg: Package) -> str:
    text = pkg.manifest.read_text()
    if pkg.name == "bifrost-ts":
        m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    elif pkg.name == "bifrost-py":
        m = re.search(
            r'\[project\][^\[]*?\bversion\s*=\s*"([^"]+)"',
            text,
            flags=re.DOTALL,
        )
    elif pkg.name == "bifrost-rs":
        m = re.search(
            r'\[workspace\.package\][^\[]*?\bversion\s*=\s*"([^"]+)"',
            text,
            flags=re.DOTALL,
        )
    else:
        raise ValueError(f"unknown package: {pkg.name}")
    if not m:
        raise RuntimeError(f"could not read current version from {pkg.manifest}")
    return m.group(1)


def write_version(pkg: Package, new_version: str) -> None:
    text = pkg.manifest.read_text()
    if pkg.name == "bifrost-ts":
        text = re.sub(
            r'("version"\s*:\s*")[^"]+(")',
            rf"\g<1>{new_version}\g<2>",
            text,
            count=1,
        )
    elif pkg.name == "bifrost-py":
        text = re.sub(
            r'(\[project\][^\[]*?\bversion\s*=\s*")[^"]+(")',
            rf"\g<1>{new_version}\g<2>",
            text,
            count=1,
            flags=re.DOTALL,
        )
    elif pkg.name == "bifrost-rs":
        old = read_version(pkg)
        text = re.sub(
            r'(\[workspace\.package\][^\[]*?\bversion\s*=\s*")[^"]+(")',
            rf"\g<1>{new_version}\g<2>",
            text,
            count=1,
            flags=re.DOTALL,
        )
        # Inside `[workspace.dependencies]`, every `bifrost-* = { ...
        # version = "<old>" ... }` pin must move with the workspace
        # version so the umbrella crate's published artifact references
        # the just-published sibling crates.
        text = _bump_workspace_dependency_pins(text, old, new_version)
    else:
        raise ValueError(f"unknown package: {pkg.name}")
    pkg.manifest.write_text(text)


def _bump_workspace_dependency_pins(text: str, old: str, new: str) -> str:
    """Rewrite `bifrost-* version = "<old>"` lines inside `[workspace.dependencies]`."""

    out_lines: list[str] = []
    in_workspace_deps = False
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_workspace_deps = stripped == "[workspace.dependencies]"
        elif in_workspace_deps and stripped.startswith("bifrost-"):
            line = re.sub(
                rf'(version\s*=\s*"){re.escape(old)}(")',
                rf"\g<1>{new}\g<2>",
                line,
            )
        out_lines.append(line)
    return "".join(out_lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


@dataclass
class BumpResult:
    package: str
    level: str
    old_version: str
    new_version: str
    changed_files: list[str] = field(default_factory=list)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", nargs="?", default=None, help="base ref (defaults to last release commit)")
    parser.add_argument("head", nargs="?", default="HEAD", help="head ref")
    parser.add_argument("--dry-run", action="store_true", help="don't write manifests")
    parser.add_argument("--json", action="store_true", help="print machine-readable summary")
    args = parser.parse_args(argv)

    base = args.base or find_last_release_sha()
    head = args.head

    commits = commits_in_range(base, head)
    files = files_in_range(base, head)

    bumps = compute_bumps(commits, files)
    results: list[BumpResult] = []
    for pkg in PACKAGES:
        if pkg.name not in bumps:
            continue
        level = bumps[pkg.name]
        current = read_version(pkg)
        new_version = bump_version(current, level)
        if not args.dry_run:
            write_version(pkg, new_version)
        results.append(
            BumpResult(
                package=pkg.name,
                level=level,
                old_version=current,
                new_version=new_version,
                changed_files=[str(pkg.manifest.relative_to(REPO_ROOT))],
            )
        )

    payload = {
        "base": base,
        "head": head,
        "commit_count": len(commits),
        "bumps": [r.__dict__ for r in results],
    }
    if args.json:
        json.dump(payload, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
    else:
        if not results:
            print("no version bumps required")
        else:
            for r in results:
                print(f"{r.package}: {r.old_version} → {r.new_version} ({r.level})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
