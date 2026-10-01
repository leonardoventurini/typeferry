# TypeFerry Release Status

The TypeScript implementation is configured for operator-controlled publication to the public npm registry. Python, Rust, Ruby, and Go publication remains disabled until their registry identities and workflows are approved separately.

## Registry Identities

| Implementation | Registry identity             |  Version | Status                                   |
| -------------- | ----------------------------- | -------: | ---------------------------------------- |
| TypeScript     | `typeferry`                   | `0.12.0` | Unpublished candidate                    |
| Python         | `typeferry-py`                |  `0.2.0` | Temporary identity; publication disabled |
| Rust           | `typeferry` and `typeferry-*` |  `0.2.0` | Workspace publication disabled           |
| Ruby           | `typeferry-rb`                |  `0.1.0` | Temporary identity; publication disabled |
| Go             | `github.com/leonardoventurini/typeferry/typeferry-go` | Untagged | Approved API; local and remote parity passed; no release tag |

## Go candidate review

The candidate implements the shared server protocol and interoperates with the
unchanged TypeScript client. Its [parity specification](specs/2026-09-29-go-server-parity.md)
records full Go unit/race/vet and Redis verification, 25 focused client cases,
and the complete TypeScript package checks. The user approved the public Go API,
import path and pinned adapter dependencies on 2026-09-30. All four jobs in
[CI run 36806767551](https://github.com/leonardoventurini/typeferry/actions/runs/36806767551)
pass on `32480dd`, including Go/Redis race/vet and real TypeScript client
interoperability. The server parity implementation is accepted. No Go tag,
registry upload or automated Go publication workflow has been created.

Review the import path above and the package boundaries in this order:

1. `ejson` ordered values, custom codecs and numeric spelling; `protocol` envelopes.
2. `runtime` typed registration, context, methods/events, presence and close ownership.
3. `httptransport` and `websocket` application-owned `net/http` attachment.
4. Optional `redistransport` cluster delivery and `auth` JWT/session/cookie/OAuth helpers.
5. `authoring.Group` declaration helpers and the runnable `examples/server` integration.

Core imports do not require the optional adapters. WebSocket callbacks must
honor cancellation; transport retirement joins them before application services
close. Runtime retirement rejects new work and clears presence but keeps already
admitted application callbacks under their caller's lifetime.

Go uses pinned `github.com/coder/websocket` and `github.com/redis/go-redis/v9`
adapter dependencies. MongoDB live views, a Go client and extra OAuth providers
are outside the accepted shared server scope.

## TypeScript candidate

TypeFerry is published publicly on npm at `0.11.0`. The repository prepares
`0.12.0` as an unpublished candidate adding generic iOS simulator discovery,
diagnostics, build/install/launch, logs and screenshots. Typed configuration
selects the Xcode container, scheme, build configuration, DerivedData path and
simulator. Existing web defaults and native add/sync/open behavior remain unchanged.

Published npm release: `typeferry@0.11.0`.

The candidate passed package lint/typecheck, all split unit/integration/browser
suites plus the final focused safety regressions (1,697 tests in total), the
`0.12.0` build, package artifact validation (506 files), the generic consumer
verification and an audit reporting zero vulnerabilities. The candidate version
is available for publication; no upload has been performed.

A downstream application validated the compiled candidate with real simulator
discovery, doctor, headless run, signed build, installation, launch, screenshot,
existing-output refusal and log streaming interrupted with exit code 130.
Invalid device selection was rejected. The built simulator app contained its
entitlement section and passed deep, strict codesign verification. Physical-device
behavior, distribution readiness and opening the normal Simulator GUI were not
validated by this run; GUI launch remains covered by mocked orchestration tests.

Publication is reserved for the user to perform
manually after reviewing the final validation handoff. Do not upload this candidate
automatically.

The repository template consumes the public release through `^0.8.0`; its
lockfile resolves the package tarball from the npm registry.

## npm Release Gate

Run from the repository root with Mise installed:

```sh
just verify-npm-release
```

The recipe automatically installs and selects the exact Node.js `24.19.0` and npm `11.17.0` toolchain pinned in [`.mise.toml`](.mise.toml). It then installs the locked graph, lints, typechecks, runs all split test suites, builds the package, executes `npm pack --dry-run --json`, and validates every tarball path. The artifact may contain only `README.md`, `package.json`, and compiled JavaScript, declarations, and source maps beneath `dist/`. Every explicit export target must exist; tests, source, configuration, credentials, and retired Lit output are rejected. Pack verification remains repeatable after a version is published.

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
- a newly selected package version in the manifest and lockfile, with that
  exact version absent from the registry;
- the complete non-uploading release gate.

Only after those checks does it execute `npm publish --access public`. The
recipe does not bump versions, create Git tags, push commits, or store
credentials. After npm confirms the upload, create the annotated Git tag
`v0.12.0` and push the release commit and tag. No GitHub release is created.

An npm version cannot be reused after publication. If a release is incorrect, deprecate it as appropriate, fix the repository, choose a higher semantic version, and rerun the gate.

## Other Implementations

- `typeferry-py/pyproject.toml` retains a temporary distribution identity and has no publication workflow.
- `typeferry-rs/Cargo.toml` keeps workspace publication set to `false`.
- `typeferry-rb/` builds a local gem for verification but has no RubyGems publication workflow.
- `typeferry-go/` is an in-repository Go module under parity review. Its
  example and Go/TypeScript interoperability suites compile and run locally;
  no version tag or Go module release has been approved.
- No GitHub workflow uploads packages or contains registry credentials.

Enabling PyPI or crates.io publication requires a separate identity, authentication, dependency-order, migration, and rollout decision.
