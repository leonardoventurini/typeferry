# Optional iOS application target

## Context
Client build tooling and transport configuration already belong to TypeFerry.
Bundled mobile clients have a different origin and application lifecycle from
browser clients, requiring native-owned permissions and private session cookies.

## Decision
Provide an explicit iOS build target and optional Capacitor entry point. Keep
Capacitor runtime imports out of the core client and web entry path. Generate
client-only assets and native configuration from validated public application
metadata; retain app ownership of identity, endpoints, signing and product UI.
Preserve web defaults and shared protocol semantics. Native authentication uses
a single-use PKCE handoff with an application-owned atomic grant store.

## Alternatives and consequences
A live remote website wrapper was rejected as the default: bundled assets give
an explicit native/web version boundary. A native UI rewrite is unnecessary.
Template synchronization preserves app-owned edits and fails on ownership
conflicts. No downstream-specific domain, path, fixture, credential, or test
invocation belongs to this public package. Native compilation and simulator
checks cannot establish real-device media behavior.
