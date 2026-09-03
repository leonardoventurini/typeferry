# Configurable server build externals

## Problem

The package-owned `typeferry build` command always bundles every server runtime
dependency. Applications such as Mentagen must keep a custom esbuild command
because native modules and packages with runtime-loaded assets need to remain
external. The public CLI has no build flag for this requirement, and the strict
`typeferry.config.ts` schema rejects an equivalent configuration field.

## Evidence

- `typeferry-ts/src/application/server-build.ts` sets `bundle: true` but does
  not set esbuild's `external` option.
- `typeferry-ts/src/application/config.ts` exposes only `build.target` and
  `build.sourceMaps`.
- `typeferry-ts/src/application/cli-arguments.ts` rejects every argument after
  `typeferry build`.
- Mentagen's production server build explicitly externalizes `vite`, `sharp`,
  `bson`, `mongodb`, `mongoose`, `ioredis`, `node-resque`, and `ws`; its Docker
  build prunes the lockfile installation to production dependencies and copies
  that graph into the runtime image.

## Desired outcome

Add a typed `build.server.external` configuration list. Pass configured package
specifiers to esbuild for both production and development server builds. Reject
configured externals that are not declared as direct application production
dependencies, ensuring that a pruned runtime installation contains every
externalized package.

Prepare the additive public contract as `typeferry@0.9.0` for operator-controlled
npm publication.

## Scope

### In scope

- Public `build.server.external: string[]` configuration.
- Strict runtime validation of non-empty, unique package specifiers.
- Direct `dependencies` validation against the application `package.json`.
- esbuild `external` propagation in production and development.
- Unit and procedural consumer coverage.
- Framework, deployment, changelog, version, and release-status documentation.
- Package version `0.9.0` in the TypeScript manifest and lockfile.

### Out of scope

- Raw esbuild configuration passthrough or new build CLI flags.
- Automatic externalization of all dependencies.
- Dockerfile generation or dependency installation by TypeFerry.
- Changing the template's default fully bundled build.
- Mentagen source changes, npm publication, Git tags, or pushes.
- Protocol, Python, or Rust changes.

## Uncertainty and assumptions

- External entries are npm package specifiers, including subpath imports; the
  required manifest dependency is the owning package name (`mongodb` for
  `mongodb/...`, `@scope/pkg` for `@scope/pkg/...`).
- Node built-ins and relative or absolute paths are not package dependencies
  and are rejected. TypeFerry's high-level option is intentionally narrower
  than raw esbuild `external` patterns.
- Direct production dependencies are the stable deployment contract. A
  transitive or dev-only installation is insufficient because npm may change
  hoisting and `npm prune --omit=dev` may remove it.

## Contracts

```ts
export default defineConfig({
  build: {
    server: {
      external: ['sharp', 'mongodb', '@scope/runtime/subpath'],
    },
  },
})
```

- Omitting `build.server.external` resolves to an empty list and preserves the
  current fully bundled server artifact.
- Each entry must be a non-empty bare package specifier without wildcard
  patterns.
- Each owning package must exist in the root application's `dependencies`.
- Invalid configuration fails before a build or development process starts and
  identifies the offending external and required manifest section.
- TypeFerry passes the validated list unchanged to esbuild's `external` option.
- The application owns installation and shipment of externalized dependencies
  in its production environment.

## Test strategy and acceptance criteria

- [ ] Configuration typing and resolution accept `build.server.external` and
      default it to an empty list.
- [ ] Runtime schema rejects empty entries, duplicates, and unknown fields.
- [ ] Package-name extraction covers unscoped, scoped, and subpath specifiers
      and rejects relative, absolute, wildcard, and malformed values.
- [ ] Loading configuration accepts direct production dependencies and rejects
      missing, dev-only, and transitive externals with actionable errors.
- [ ] Server build options pass the configured external list to esbuild while
      an unconfigured application remains fully bundled.
- [ ] A procedurally generated packed consumer builds with an external runtime
      dependency and preserves its import in `dist/server/index.cjs`.
- [ ] Documentation explains configuration, production dependency ownership,
      and Docker/pruned-install behavior.
- [ ] Package version, lockfile, changelog, and release status identify the
      unpublished `0.9.0` candidate.
- [ ] Unit, integration, browser, lint, typecheck, build, pack inspection, and
      the repository npm release gate pass.

## Risks

- Incorrect package-name parsing could reject valid npm package subpaths or
  allow patterns that do not map to an installable dependency.
- Externalizing a package changes runtime resolution and can make an otherwise
  successful build fail only after deployment.
- Validating direct dependencies can reject applications that currently rely
  on accidental hoisting; that rejection is intentional but needs actionable
  diagnostics.
- The complete release gate depends on Docker when no external Redis service is
  configured.

## Recovery

Before publication, revert the release commits and keep `0.8.0` as the current
release. After publication, npm version reuse is impossible; correct defects in
a higher version and deprecate `0.9.0` if appropriate. Applications can recover
independently by removing `build.server.external` and restoring their custom
server build until corrected.

## Direct rollout

Commit the tested package and documentation changes on `main` without
publishing, tagging, or pushing. Run `just verify-npm-release`; after every gate
passes, hand the clean `0.9.0` candidate to the package owner for
`just publish-npm`.

## Executable checklist

- [ ] Add failing configuration, dependency-validation, and build-option tests.
- [ ] Implement the typed configuration and package dependency validation.
- [ ] Propagate externals to server development and production builds.
- [ ] Extend the procedural packed-consumer verification.
- [ ] Update framework and deployment documentation.
- [ ] Record the architectural decision.
- [ ] Bump the package candidate to `0.9.0` and update release documentation.
- [ ] Run focused and complete release verification.
