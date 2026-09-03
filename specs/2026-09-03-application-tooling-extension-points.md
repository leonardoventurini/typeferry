# Application tooling extension points

## Problem

The package-owned application commands support only the starter defaults. A
production consumer such as Mentagen needs additional HTTP proxy routes, Vite
plugins and configuration, server bundle exclusions, build completion hooks,
and test-project tuning. Today adopting `typeferry develop`, `build`, and
`test` would silently remove those behaviors.

## Evidence and uncertainty

- `src/application/config.ts` accepts only ports, an environment file, build
  target/source maps, integration timeout, and browser engine.
- `src/application/proxy.ts` proxies only `/__h`.
- `src/application/vite-config.ts`, `server-build.ts`, and `test-config.ts`
  construct closed configurations.
- Mentagen has route-specific proxy and cookie policies, domain fallback,
  SVGR/compression plugins, stable service-worker output, bundle externals,
  post-build work, CI test concurrency/reporters, and dependency optimization.
- The exact smallest reusable API will be established with consumer-neutral
  tests. Arbitrary untyped config merging is out of scope.

## Contracts

- Keep conventional applications configuration-free.
- Add strongly typed, additive extension points that receive resolved paths
  and mode and return supported Vite/esbuild/Vitest fragments or hooks.
- Preserve TypeFerry's required React, Tailwind, decorator, alias, proxy,
  output, and test-discovery contracts when extensions are used.
- Support segment-boundary development proxy routes with explicit host and
  cookie rewrite policies.
- Do not reference or execute another repository from TypeFerry tests or
  release tooling.
- Document extension ordering and ownership.

## Risks and recovery

- Unsafe merge ordering could let consumers replace framework invariants.
  Pin ordering and non-overridable fields in unit tests.
- Loading application callbacks through `jiti` can produce incompatible
  module values. Validate every serializable field and keep functions typed.
- Tool APIs may become public compatibility surface. Prefer a narrow
  application adapter contract over exporting internal builders.
- Recovery is a revert of this additive commit; default consumers remain
  unchanged.

## Direct rollout

Release as the next patch/minor pre-1.0 package after the complete package
gate passes. Until publication, validate Mentagen against a locally packed or
linked artifact. Publication and pushing remain manual operator actions.

## Executable checklist

- [ ] Add failing unit tests for every required extension and invariant.
- [ ] Implement typed configuration and composition.
- [ ] Add proxy route coverage including path-segment boundaries and cookies.
- [ ] Update the application framework guide and template-facing guidance.
- [ ] Run affected unit tests, lint, typecheck, all split tests, build, pack
      dry-run, and audit.

## Verification

Acceptance requires unchanged default snapshots, passing extension contract
tests, strict types and lint, all TypeFerry split suites, successful package
build and dry-run pack, and no security audit findings.
