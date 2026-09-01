# TypeFerry Release Status

TypeFerry is intentionally non-publishable while its final npm, PyPI, Cargo,
and repository identities are being selected.

## Current Local Identities

| Implementation | Temporary identity | Manifest |
|---|---|---|
| TypeScript | `typeferry-ts` | `typeferry-ts/package.json` |
| Python | `typeferry-py` | `typeferry-py/pyproject.toml` |
| Rust | `typeferry` and `typeferry-*` | `typeferry-rs/Cargo.toml` |

These names exist only to keep local builds, tests, imports, and dependency
graphs coherent. They are not approved registry identifiers.

## Publication Guards

- `typeferry-ts/package.json` sets `private: true` and has no
  `publishConfig` or publish lifecycle script.
- `typeferry-rs/Cargo.toml` sets workspace publication to `false`; every
  publishable crate inherits that setting.
- Python has no publication workflow or configured repository URL.
- Forgejo publish and release-bump workflows are absent. CI only verifies
  source, tests, and build artifacts.
- The project has no Git remote after preserving the pre-rebrand save point.

Do not add registry credentials, publishing workflows, package repository URLs,
or release automation until a separate approved decision selects all external
identifiers and the new repository location.

## Local Verification

Use the language-native checks documented in `AGENTS.md`. TypeScript npm
commands run from `typeferry-ts/` with Node.js `24.19.0` and npm `11.17.0`.
The template currently resolves `typeferry-ts` through
`file:../typeferry-ts`, so it can be verified without a registry package.

`npm pack --dry-run` remains a useful build-surface inspection even though npm
publication is blocked. Cargo and Python package builds may likewise be used
for local artifact inspection; they do not authorize uploads.

## Re-enabling Releases

A future release decision must establish, at minimum:

1. the TypeFerry repository URL and Git remote;
2. final npm, PyPI, and Cargo identifiers;
3. whether the implementations remain independently versioned;
4. migration policy from previously published packages;
5. registry authentication and trusted-publishing policy;
6. CI gates and dependency publication order;
7. updated consumer installation instructions.

Re-enable publishing only after manifests, lockfiles, documentation, package
artifacts, and CI all agree on those decisions.
