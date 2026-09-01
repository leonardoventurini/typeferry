# Dependency Update Runbook

Use this runbook for direct dependency additions, removals, upgrades, overrides, or feature changes.

## Preconditions

- Identify the package, reason, affected runtime surface, security implications, and rollback version.
- Obtain explicit approval before adding a production dependency or changing a security boundary.
- Prefer existing platform capabilities and dependencies before adding another package.
- Review release notes and migration guidance from the dependency's primary source.

## TypeScript

Run npm commands from `typeferry-ts/` with Node.js `24.19.0` and npm `11.17.0`.

```sh
npm install <package>@<version>
npm audit --audit-level=low
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Use the appropriate npm removal or development-dependency command instead of manually editing the lockfile. Keep overrides narrowly justified. Confirm the package archive does not accidentally include development files or source-only imports.

## Python

Python dependency ranges live in `typeferry-py/pyproject.toml`; the repository does not maintain a Python lockfile. Keep integrations in the appropriate optional extra and install the changed extra into a clean environment before verification.

From `typeferry-py/`:

```sh
python -m pip install -e '.[dev,all]'
python -m pytest
ruff check .
mypy
```

Do not move an optional transport, auth, or schema dependency into the core dependency set without an approved packaging decision.

## Rust

Use Cargo from `typeferry-rs/` and keep shared versions in `[workspace.dependencies]` where appropriate.

```sh
cargo update -p <package> --precise <version>
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

Review `Cargo.lock` and the feature graph. Avoid enabling broad default features when a smaller explicit set is sufficient.

## Acceptance criteria

- Manifest and lockfile changes are coherent for ecosystems that use a lockfile.
- The dependency is placed at the narrowest correct layer.
- Security audit output and unresolved advisories are reported.
- Relevant tests, static checks, and release-surface checks pass.
- Documentation and licensing notices are updated when required.

## Recovery

Revert the manifest and lockfile together. If a vulnerability forced the update, document why rollback is unsafe and choose a supported alternative version or dependency instead.
