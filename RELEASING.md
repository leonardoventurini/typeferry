# TypeFerry Release Status

The TypeScript implementation is configured for operator-controlled publication to the public npm registry. Python and Rust publication remains disabled until their registry identities and workflows are approved separately.

## Registry Identities

| Implementation | Registry identity | Version | Status |
|---|---|---:|---|
| TypeScript | `typeferry` | `0.7.0` (published); `0.7.1` (candidate) | Public npm release enabled; compatibility candidate prepared |
| Python | `typeferry-py` | `0.2.0` | Temporary identity; publication disabled |
| Rust | `typeferry` and `typeferry-*` | `0.2.0` | Workspace publication disabled |

TypeFerry is published publicly on npm at `0.7.0`, including MongoDB schema
enforcement. The `0.7.1` candidate corrects BSON boolean and readonly-schema
compatibility. The release recipe rechecks that the exact candidate version is
absent immediately before every upload.

## npm Release Gate

Run from the repository root with Mise installed:

```sh
just verify-npm-release
```

The recipe automatically installs and selects the exact Node.js `24.19.0` and npm `11.17.0` toolchain pinned in [`.mise.toml`](.mise.toml). It then installs the locked graph, lints, typechecks, runs all split test suites, builds the package, executes `npm publish --dry-run --json`, and validates every tarball path. The artifact may contain only `README.md`, `package.json`, and compiled JavaScript, declarations, and source maps beneath `dist/`. Every explicit export target must exist; tests, source, configuration, credentials, and retired Lit output are rejected.

The integration suite requires Redis. The release recipe uses `REDIS_URL` unchanged when it is set. Otherwise, it starts a temporary `redis:7-alpine` Docker container on a dynamically assigned loopback port, waits for readiness, and removes it after the tests. Keep Docker running for the automatic fallback, or provide a reachable external Redis URL.

CI runs the same package-artifact validator after its complete TypeScript gate.

## Publish to npm

Authenticate with npm using the account and two-factor/trusted-publishing policy appropriate to the package, then run from a clean `main` checkout:

```sh
npm login --registry=https://registry.npmjs.org/
just publish-npm
```

The recipe requires:

- automatic installation and selection of the exact Node/npm versions through Mise;
- a clean tracked and untracked worktree on `main`;
- successful `npm whoami` against the public registry;
- package identity `typeferry@0.7.1` and an absent registry version (after the
  release commit bumps the package manifest and lockfile);
- the complete non-uploading release gate.

Only after those checks does it execute `npm publish --access public`. The
recipe does not bump versions, create Git tags, push commits, or store
credentials. After npm confirms the upload, create the annotated Git tag
`v0.7.1` and push the release commit and tag. No GitHub release is created.

An npm version cannot be reused after publication. If a release is incorrect, deprecate it as appropriate, fix the repository, choose a higher semantic version, and rerun the gate.

## Other Implementations

- `typeferry-py/pyproject.toml` retains a temporary distribution identity and has no publication workflow.
- `typeferry-rs/Cargo.toml` keeps workspace publication set to `false`.
- No GitHub workflow uploads packages or contains registry credentials.

Enabling PyPI or crates.io publication requires a separate identity, authentication, dependency-order, migration, and rollout decision.
