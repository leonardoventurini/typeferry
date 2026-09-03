# Package-owned TypeFerry application commands

## Context

The standalone TypeScript template copied development orchestration, Vite
configuration, a TypeFerry development proxy, and three Vitest configurations.
Those files encoded framework conventions rather than application policy and
had to be synchronized manually when TypeFerry or its tools changed.

Existing consumers import TypeFerry runtime entry points without using the
application template. The new workflow therefore had to be additive and keep
toolchain modules outside existing runtime dependency graphs.

## Decision

Add `develop`, `build`, and `test` commands to the existing `typeferry`
npm package. Keep the conventional root-level `client/`, `common/`,
`server/`, and `test/` structure and require no TypeFerry configuration for
that layout.

Add an optional `typeferry.config.ts` loaded through `typeferry/config`.
Expose only typed, high-level development, build, and test overrides; do not
accept raw Vite or Vitest configuration.

Export `typeferry/test` as a full mirror of the installed Vitest API. The
mirror explicitly follows Vitest and makes no independent compatibility
promise for individual exports. Enable Vitest browser globals because its mock
transformer requires `vi` to be global when other APIs are imported through a
mirror.

Keep TypeScript, ESLint, Prettier, Mise, production Docker, and MongoDB Compose
configuration application-owned. Remove the template's development image and
Compose development service.

Keep application tooling isolated in package application and CLI modules.
Existing runtime exports must not import those modules. Use Vite `7.3.6`, the
security-patched release in the existing compatible major, because adopting
Vite 8 simultaneously broke TypeFerry's decorator transform suites and was not
required for the application commands.

Target the additive public package surface as `typeferry@0.8.0`.

## Rejected alternatives

- A separate framework package was rejected in favor of one TypeFerry
  dependency and coordinated upgrades.
- Bundling Node.js or distributing a native launcher was rejected as excessive
  scope for simplifying application setup.
- Owning TypeScript, lint, formatting, dotfiles, and all container behavior was
  rejected because it would turn the feature into a general toolchain and
  distribution platform.
- Raw Vite and Vitest passthrough was rejected because it would make their
  complete APIs accidental TypeFerry contracts.
- Keeping copied Vite and Vitest configuration was rejected because it retains
  the boilerplate and synchronization problem.
- Adopting Vite 8 in the same release was rejected after focused verification
  demonstrated decorator-suite regressions.

## Rationale

Development, builds, and tests contain the most TypeFerry-specific copied
machinery and provide the largest setup reduction. Their conventional inputs
and outputs are already exercised by the template, making them suitable
framework contracts.

Keeping all existing runtime entry points unchanged and enforcing their lack of
tool imports lets non-framework consumers upgrade without adopting new
commands. A packed procedural consumer verifies both the new workflow and
imports from existing client, server, and EJSON entry points.

## Consequences

- Runtime-only consumers install a larger dependency graph even though their
  imports remain isolated from it.
- Vite, Vitest, esbuild, and command plugins become TypeFerry implementation
  dependencies.
- Applications use `typeferry/test` for the mirrored API. Browser mocks use
  global `vi` because of Vitest's browser transform constraint.
- Production build paths remain `dist/client/` and
  `dist/server/index.cjs`, preserving the start script and production image.
- The template temporarily uses `file:../typeferry-ts` with npm packed-link
  installation until `0.8.0` is published. During that interval its
  production Docker build cannot access the sibling package outside the
  template build context.
- Immediately after publication, restore the template dependency to `^0.8.0`,
  regenerate its registry lock entry, rerun all template gates, and verify the
  production image.
