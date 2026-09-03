# TypeFerry application framework CLI

## Problem

The standalone TypeScript application template copies TypeFerry-specific
development orchestration, Vite configuration, a development HTTP proxy, and
three Vitest configurations. Applications must maintain this machinery even
though it encodes framework conventions rather than application policy.

The framework package already exposes stable runtime entry points used by
consumers that do not use the template. Adding application tooling must not
load toolchain code through, or otherwise change the behavior of, those
existing entry points.

## Evidence

- `template/develop.ts` coordinates Vite, esbuild, the backend child process,
  logs, and shutdown.
- `template/vite.config.ts` owns the conventional client root, React,
  Tailwind, aliases, output, and the TypeFerry development proxy.
- Three `template/vitest.config.*.ts` files encode unit, integration, and
  browser discovery and setup.
- `template/Dockerfile.development` and the Compose development service exist
  only to run the copied development orchestrator.
- The published `typeferry` package currently exposes runtime modules only
  and restricts packed output to compiled files under `dist/`.

## Desired outcome

Add opt-in `typeferry develop`, `typeferry build`, and `typeferry test`
commands to the existing npm package. Conventional applications require no
TypeFerry configuration file. An optional `typeferry.config.ts` accepts
typed, high-level overrides.

Export `typeferry/test` as a full mirror of Vitest's public exports. This
mirror is explicitly unstable relative to Vitest and does not create a
TypeFerry-specific compatibility promise for each mirrored symbol.

Migrate the template to the new commands and remove its development Docker
image and Compose development service.

## Scope

### In scope

- A `typeferry` package binary and CLI routing.
- Conventional application-root and path resolution.
- Optional typed `typeferry.config.ts` loading and validation.
- Package-owned Vite development and client production configuration.
- Package-owned esbuild server development and production configuration.
- Package-owned TypeFerry development proxy and process lifecycle.
- Package-owned unit, integration, and browser Vitest projects.
- `typeferry/config` and `typeferry/test` exports.
- Production dependencies required by these commands.
- Version `0.8.0` package, lock, documentation, and release contracts.
- Template migration and development-container removal.
- Runtime-consumer compatibility and tooling-isolation verification.

### Out of scope

- Bundling Node.js or distributing a native launcher.
- TypeScript, ESLint, or Prettier presets or commands.
- Managed dotfiles, scaffolding, synchronization, or migration commands.
- Production Docker or MongoDB Compose generation.
- A `typeferry start` command.
- Protocol, wire, Python, or Rust changes.

## Contracts

### Commands

- `typeferry develop [-- <server arguments>]`
- `typeferry build`
- `typeferry test [unit|integration|browser] [--watch]`

Unknown commands, projects, or unsupported arguments fail with non-zero exit
status and actionable usage text.

### Conventional paths

- Application root: nearest ancestor containing `package.json`.
- Client root: `client/`.
- Client entry: `client/index.html`.
- Common root: `common/`.
- Server root and entry: `server/` and `server/index.ts`.
- Test support: `test/`.
- Output: `dist/client/` and `dist/server/index.cjs`.
- Root alias: `@/`.

### Configuration

`typeferry.config.ts` is optional. Supported initial overrides are:

- Development client and server ports.
- Development server environment file.
- Build target and source maps.
- Integration timeout.
- Browser name.

Raw Vite and Vitest configuration passthrough is excluded.

### Test export

`typeferry/test` re-exports all public Vitest exports. Documentation labels
the mirror unstable and directs consumers to TypeFerry's pinned Vitest version
when assessing availability or behavior.

### Compatibility

- Every existing package export remains present and behaviorally unchanged.
- Existing runtime entries have no static or dynamic dependency on application
  tooling.
- Existing consumers need not adopt the CLI, configuration, or test export.
- Production build paths remain compatible with the template's existing start
  command and production Dockerfile.

## Test strategy

Tests precede or accompany each implementation unit:

1. Add failing unit contracts for CLI parsing, path defaults, configuration
   defaults, accepted overrides, and invalid configuration.
2. Add failing unit contracts for Vite/esbuild configuration generation and
   development server argument construction.
3. Add failing tests for named Vitest project generation and the full
   `typeferry/test` mirror.
4. Add release-contract tests for the binary, exports, packed files, dependency
   ownership, and unchanged existing exports.
5. Add a procedural packed-consumer fixture that imports old runtime entries
   without loading tooling, then exercises the new build and test commands.
6. Migrate template tests to `typeferry/test` and assert obsolete application
   files and development-container configuration are absent.

Run the narrowest affected suite first. Final verification includes package
lint, typecheck, split tests, build, dry-run pack, publication contracts,
template format check, lint, typecheck, split tests, builds, audit, production
container validation where available, and repository documentation links.

## Acceptance criteria

- [x] Conventional applications need no `typeferry.config.ts`.
- [x] Optional configuration is typed, validated, and limited to approved
      high-level fields.
- [x] `typeferry develop` preserves proxy, compiler, subprocess, logging,
      failure, and shutdown behavior.
- [x] `typeferry build` preserves client manifest and bundled server output.
- [x] `typeferry test` runs unit, integration, and browser projects together
      or individually, with watch support.
- [x] `typeferry/test` mirrors Vitest and is documented as unstable.
- [x] Existing exports remain available and isolated from tooling modules.
- [x] The packed package works in a procedurally generated consumer.
- [x] The template contains no development script, Vite config, split Vitest
      configs, development proxy, development Dockerfile, or Compose
      development service.
- [x] TypeScript, ESLint, Prettier, Mise, production Docker, and MongoDB Compose
      remain application-owned.
- [x] Package and template quality, test, build, pack, and audit gates pass.

## Risks

- Moving tools to production dependencies increases install size for
  runtime-only consumers.
- A Vitest wildcard mirror can change when TypeFerry updates Vitest.
- Programmatic tool APIs may change across Vite or Vitest upgrades.
- Root and singleton resolution can differ between the monorepo, a packed
  package, and an independently installed consumer.
- Development subprocess cleanup can behave differently across platforms.
- Browser and MongoDB suites depend on external binaries or services.

## Recovery

The feature is additive until the template migration. If package tooling fails,
remove the new binary and exports while retaining all existing runtime exports.
The template migration is a separate commit and can be reverted independently
to restore its prior scripts and configurations.

Before publication, a packed-consumer or complete-template verification
failure required retaining version `0.7.5` and correcting the candidate. Now
that `0.8.0` is published, any release defect must be corrected in a higher
semantic version because npm versions cannot be reused.

## Direct rollout

Release the completed package as `0.8.0`. Existing consumers receive no
runtime API migration. Framework applications opt in by changing scripts and,
for tests, imports. The repository template migrates in the same release and
serves as the canonical example.

## Implementation note

The pre-publication rollout temporarily used `file:../typeferry-ts` with npm
packed-link installation so the template could verify the candidate. After
`0.8.0` was published, the template returned to `^0.8.0` with a registry-backed
lock entry, removing the Docker build-context limitation.

## Executable checklist

- [x] Implement and verify configuration and CLI unit contracts.
- [x] Implement and verify development and build commands.
- [x] Implement and verify test projects and `typeferry/test`.
- [x] Extend build, pack, publication, and compatibility contracts.
- [x] Migrate the template and remove development-container artifacts.
- [x] Update current documentation and package changelog.
- [x] Run complete package and template verification.
- [x] Record the accepted architecture in a decision.
