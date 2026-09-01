# npm Publication Specification

## Problem

The TypeScript implementation still uses the temporary private identity `typeferry-ts`, version `0.5.0`, and has no supported publication command. End-user documentation explicitly says npm publication is unavailable. The final npm identity, first public version, and release workflow have now been selected.

## Evidence

- `typeferry-ts/package.json` sets `name: "typeferry-ts"`, `version: "0.5.0"`, and `private: true` without repository or public publication metadata.
- The React template consumes a local dependency named `typeferry-ts`, and active examples import `typeferry-ts/*`.
- No repository-root `justfile` exists; the template has an application-only `justfile`.
- `RELEASING.md` describes all registry identities as temporary and publishing as disabled.
- An exact npm registry check at `2026-09-01T23:23:55Z` returned HTTP 404 for `typeferry`; this means no public package document was found at that instant, not that the name is reserved or guaranteed publishable.
- `npm whoami` currently reports `ENEEDAUTH`, so an actual upload cannot succeed until the operator authenticates.

## Desired Outcome

Make the TypeScript package publicly releasable as unscoped npm package `typeferry` at version `0.6.0`, migrate active consumer imports to that identity, and add a repository-root `just publish-npm` command that validates and publishes the exact package artifact to the public npm registry.

## Scope and Contracts

- Change only the TypeScript distribution's registry identity; Python and Rust remain non-publishable.
- Rename the npm manifest package from `typeferry-ts` to `typeferry` while retaining the implementation directory `typeferry-ts/`.
- Set version `0.6.0`, reflecting the breaking pre-1.0 Lit removal and clean public identity.
- Remove `private: true` and add explicit repository, homepage, bugs, and public-registry `publishConfig` metadata.
- Migrate active TypeScript imports, template dependency metadata, package documentation, aliases, and tests from `typeferry-ts/*` to `typeferry/*`.
- Preserve historical/spec/decision evidence where a temporary identity is material, but mark superseded release-policy documents clearly and prevent stale instructions from governing current publication.
- Add `just publish-npm` at the repository root. It must require `main`, a clean tracked worktree, exact Node.js `24.19.0` and npm `11.17.0`, successful npm authentication, the expected package name/version, and a version absent from the registry before executing the complete release gate and `npm publish --access public`.
- Add a non-uploading `just verify-npm-release` dependency/recipe so the command can be tested safely.
- Add one package-artifact validator used by both Just and CI. It must execute npm's publish dry run, parse the reported tarball contents, require `README.md`, `package.json`, and compiled `dist` JavaScript/declarations/source maps only, validate every declared export target, and reject source, tests, configuration, credentials, and retired surfaces.
- Extend TypeScript CI to run the same release verification without authentication or upload.
- Do not create tags, push Git state, embed credentials, or execute the actual publish command during implementation.

## Test Strategy

Update repository contract tests before implementation so they initially reject the temporary/private identity and require the root publication recipes. Then verify:

1. Manifest name/version/publication metadata and synchronized package/template locks.
2. No active imports or aliases use the temporary package identity.
3. Recipe syntax and fail-closed guards, including unauthenticated and already-published versions.
4. Exact npm toolchain, lint, typecheck, split unit/integration/browser suites, build, and dry-run pack.
5. The packed manifest exposes `typeferry@0.6.0`, public metadata, README, declarations, and compiled ESM without source files or retired Lit output.
6. The local React template installs, typechecks, tests, and builds with dependency key/imports `typeferry` using `file:../typeferry-ts`.
7. Local Markdown links, release documentation, structural scans, and `git diff --check`.
8. CI configuration tests prove the npm artifact verifier remains wired into the TypeScript job.

## Acceptance Criteria

- [x] npm manifest and lock expose `typeferry@0.6.0` and allow public publication.
- [x] Repository, homepage, bugs, license, files, exports, engines, and public-registry metadata are complete and accurate.
- [x] Active imports, aliases, docs, and the React template use `typeferry/*`; the implementation directory remains `typeferry-ts/`.
- [x] Root `just publish-npm` validates branch, tracked cleanliness, toolchain, authentication, identity, version availability, full tests/build, and package contents before public upload.
- [x] A safe non-uploading recipe exercises the same release gate.
- [x] CI executes npm publish dry-run and the shared exact-content artifact validator without uploading.
- [x] Publication cannot proceed from an unauthenticated session or when the exact version already exists.
- [x] Python and Rust publication guards remain unchanged.
- [x] Contract tests, TypeScript quality gates, package inspection, template gates, Markdown links, and diff checks pass.
- [x] Release and end-user documentation describe npm installation and the operator workflow without claiming the name is reserved before publication.
- [x] A decision record captures the npm identity, version baseline, publication boundary, and rejected alternatives.
- [x] Task-owned changes are committed semantically and the worktree is clean.

## Risks and Recovery

- npm name availability can change between inspection and upload. The recipe rechecks the exact version/name immediately before publishing and fails closed on registry or authentication errors.
- Renaming the package breaks imports that retain `typeferry-ts/*`. Repository-wide contract tests and the template migration detect stale active usage.
- `npm publish` is irreversible for practical release history. The recipe verifies before upload and never increments versions automatically.
- Full integration tests need Python and Redis prerequisites. Publication fails rather than silently skipping them.
- Recovery before publication is a normal revert. After publication, deprecate a bad version and publish a corrected higher version; never reuse the released version.

## Executable Checklist

1. Commit this specification.
2. Update contract tests to require the final npm identity and release recipes.
3. Update package metadata/version with npm so the manifest and lock remain synchronized.
4. Migrate active imports, aliases, template dependency metadata, and documentation.
5. Add the shared package-artifact validator, root Just release verification/publication recipes, and focused script tests.
6. Wire the non-uploading artifact gate into TypeScript CI.
7. Update release policy and add the architectural decision record.
8. Run focused negative/positive recipe tests and the complete package/template gates.
9. Mark acceptance criteria, commit semantically, and provide an operator-oriented handoff.

## Direct Rollout

Merge the implementation first. An authenticated maintainer then runs `just publish-npm` from a clean `main` checkout. That explicit command performs the only external npm mutation.
