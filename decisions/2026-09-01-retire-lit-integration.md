# Retire the Lit Integration

## Context

TypeFerry maintained a package-owned Lit reactive-controller adapter alongside its framework-agnostic client and React adapter. Lit required a public `typeferry-ts/lit` export, peer and development dependencies, dedicated tests, generated package output, and parallel documentation. The package is not published to a registry, but repository-local consumers can still depend on that export.

## Decision

Remove the Lit implementation and `typeferry-ts/lit` export immediately, without a deprecation period, compatibility stub, or reserved module. React is the only maintained UI-framework adapter. Other UI frameworks integrate through `typeferry-ts/client` unless a future approved architecture decision expands the adapter surface.

Retain the framework-neutral direct-call design and its React adapter plan, but remove proposed Lit work. Preserve the core client, protocol, server runtime, auth, serialization, and database integrations unchanged.

## Rejected Alternatives

- A throwing compatibility export would preserve module resolution while shipping no useful behavior.
- A deprecation period would extend dependency and maintenance costs for an unpublished package.
- Keeping the export path reserved would imply a supported surface that no implementation fulfills.
- Removing the framework-neutral client would unnecessarily couple TypeFerry to React.

## Rationale

One maintained UI adapter reduces duplicated lifecycle, auth, subscription, and testing work. The core client remains sufficient for custom integrations, while React represents the supported framework-specific developer experience.

## Consequences

- Imports from `typeferry-ts/lit` fail and must be removed or replaced with direct core-client integration.
- Lit is no longer installed through TypeFerry's development or peer dependency graph.
- New framework adapters require explicit architectural approval rather than being added alongside React by default.
- Package verification must confirm that neither metadata nor `dist/` restores the retired surface.
