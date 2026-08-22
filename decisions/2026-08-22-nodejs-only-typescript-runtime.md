# Node.js-only runtime for bifrost-ts

## Context

`bifrost-ts` currently maintains Bun-native Hono/WebSocket transports and an
Express/`ws` Node fallback, while its tests and build already execute on Node.
This dual runtime produces different public HTTP application types and requires
Bun ambient declarations in consumers. ExampleApp's Hono route tree cannot use the
Express fallback.

## Decision

Version `0.4.0` makes `bifrost-ts` Node.js-only, using exact Node `24.19.0`, npm
`11.17.0`, `@hono/node-server`, and `ws`. One Node Hono transport owns HTTP and
WebSocket traffic. Bun transports, runtime detection, Express fallback, Bun
types, Bun package artifacts, and Bun-based TypeScript CI/publication are
removed.

The wire protocol remains unchanged. `bifrost-py` continues to implement the
same `PROTOCOL.md` contract.

## Rejected alternatives

- Keeping dual transports was rejected because it preserves divergent app,
  declaration, readiness, and test behavior.
- Converting ExampleApp to Express was rejected because transport adaptation is
  narrower than rewriting application routes.
- Retaining Bun only for package management or publication was rejected because
  it leaves a second toolchain in the release boundary.
- Node's native TypeScript stripping was rejected because build/test behavior
  depends on TypeScript configuration and compiled publish output.

## Consequences

- Bun runtime consumers and `Server.express` users must remain on `0.3.x` or
  migrate to Node/Hono before selecting `0.4.0`.
- The TypeScript package, CI, release workflow, published declarations, and
  ExampleApp consumer share one Node/npm contract.
- Express-only dependencies can be removed, reducing runtime and audit surface.
- Rollback is consumer pinning to `0.3.4`; published versions remain immutable.
