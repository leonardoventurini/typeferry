# Configurable server build externals

Project: `typeferry`  
Project root: `/Users/leonardo/Repositories/leonardoventurini/typeferry`  
Root ID: `ccc18213`

## Context

The package-owned application command bundles the Node.js server and its
runtime dependencies by default. Some packages cannot be safely bundled because
they contain native addons or locate runtime assets relative to their installed
package. Applications with those dependencies had to retain a separate esbuild
command, preventing complete adoption of `typeferry build`.

External imports also introduce a deployment invariant: every external package
must exist in the production runtime. Depending on dev-only installation or
transitive npm hoisting makes that invariant unstable, especially after
`npm prune --omit=dev`.

## Decision

Expose `build.server.external` as a typed list of npm package specifiers in
`typeferry.config.ts`. Apply it to the shared esbuild server options used for
development and production. Keep the default list empty so existing consumers
continue to receive a fully bundled server.

Accept unscoped packages, scoped packages, and package subpaths. Reject paths,
URLs, Node built-ins, wildcard patterns, malformed names, and duplicates. Map a
subpath to its owning package and require that package to be declared directly
in the root application's `dependencies`. Reject dev-only and undeclared
packages before starting the build or development processes.

TypeFerry does not install, copy, or generate container instructions for
externals. Applications own their production runtime graph and should derive it
from the same manifest and lockfile used during verification.

Release this additive public capability as `typeferry@0.9.0` through the
existing operator-controlled npm workflow.

## Rejected alternatives

- Raw esbuild option passthrough would make an upstream tool API part of
  TypeFerry's public compatibility surface.
- A build CLI flag would duplicate persistent application policy in scripts and
  would not naturally apply to `typeferry develop`.
- Automatically externalizing every production dependency would increase
  runtime deployment obligations and give up bundling compatibility without an
  application-specific need.
- Allowing dev-only or transitively installed externals would make successful
  deployment depend on npm hoisting and unpruned development packages.
- Having TypeFerry modify manifests or generate Dockerfiles would cross the
  established application-owned infrastructure boundary.

## Rationale

The nested server configuration leaves room for future high-level server build
controls without mixing them with client settings. A narrow package-specifier
contract covers the demonstrated native/runtime-asset use case while remaining
portable across esbuild versions. Direct production dependency validation
turns a likely deployment-only module-resolution failure into an early,
actionable configuration failure.

## Consequences

- Applications can replace custom esbuild external flags with the package-owned
  development and build commands.
- Adding an external is both a build decision and a production dependency
  commitment.
- Package subpaths remain unchanged in generated imports while validation uses
  their owning package name.
- Non-package esbuild patterns remain unsupported by design.
- A defective published `0.9.0` must be deprecated and corrected at a higher
  version because npm versions cannot be reused.
