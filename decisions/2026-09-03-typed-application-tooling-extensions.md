# Typed application tooling extensions

## Context

The package-owned commands cover conventional TypeFerry applications, while
established products can require application-specific Vite plugins, server
bundle options, test-runner tuning, and post-build artifacts. Encoding every
third-party tool option as a TypeFerry setting would duplicate those tools and
still remain incomplete.

## Decision

Keep high-level TypeFerry configuration as the preferred API and add an
explicit `extensions` escape hatch. Typed callbacks receive the resolved Vite,
esbuild, or Vitest-compatible configuration and return its complete
replacement. A separate asynchronous post-build callback runs after both
artifacts succeed. TypeFerry continues to provide configuration-free defaults;
applications using callbacks own compatibility for fields they override.
Generated Vitest projects run files serially by default to provide predictable
resource ownership; applications can deliberately opt back into parallelism
through the test extension.

Development proxy routing remains a high-level TypeFerry concept. Framework
protocol, OAuth, MCP, and discovery paths are automatic, while application HTTP
prefixes are declared as typed, segment-safe routes.

## Rejected alternatives

- Enumerating Mentagen-specific plugins and output behavior in TypeFerry would
  couple the framework to one consumer.
- Loading independent Vite and Vitest config files would create ambiguous merge
  order and preserve parallel tooling ownership.
- Proxying every unresolved browser request would make SPA navigation and typo
  handling dependent on backend behavior.

## Rationale

The callback boundary is small, type-checked against the tool versions shipped
by TypeFerry, and powerful enough for established applications. High-level
proxy routes preserve safe defaults for behavior with protocol semantics.

## Consequences

The callback signatures are public TypeScript API surface. Applications must
review their extensions when TypeFerry upgrades its embedded toolchain and must
return the framework fields they still need. Conventional applications incur
no configuration or behavioral change.
