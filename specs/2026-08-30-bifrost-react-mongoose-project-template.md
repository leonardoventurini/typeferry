# Bifrost React and Mongoose project template

## Problem and scope

Create a runnable, single-package application template at `template/` in the
Bifrost repository. It should preserve the useful architecture of ExampleApp
without copying product-specific complexity: a development orchestrator, Vite
and React client, Node/Bifrost server, Mongoose persistence, authentication
baseline, environment validation, structured logging, database migrations, and
a typed real-time sample feature.

The template must include ExampleApp-compatible TypeScript, ESLint, Prettier, and
split Vitest configuration. It is an example consumer of the published
`@example-app/bifrost` package, not another Bifrost implementation package.

## Evidence and uncertainty

- ExampleApp is a single npm package using Node `24.19.0`, npm `11.17.0`, Vite,
  React, a Node watcher plus Vite development orchestrator, path aliases, flat
  ESLint configuration, Prettier, and separate unit/integration/browser Vitest
  runners.
- Bifrost publishes compiled ESM and public exports from `bifrost-ts/dist`; the
  template must consume those exports rather than source aliases.
- The Bifrost repository is clean and already owns `specs/` and `decisions/`.
- SCS is not installed in the execution environment, so source inspection uses
  repository-local `rg` searches and direct file reads.
- Local integration verification depends on a reachable MongoDB instance. Tests
  must isolate data and fail with a useful setup message when it is absent.

## Contracts

- `template/` is a standalone ESM npm package with exact Node/npm engine
  requirements and no npm workspace dependency.
- TypeScript uses strict checking, React JSX, bundler resolution, `@/` source
  aliases, decorators compatible with Bifrost, and separate app/development
  configuration where needed.
- The browser-facing Vite server and backend Bifrost server start together via
  `npm run develop`, shut down cleanly, and proxy Bifrost HTTP/WebSocket traffic
  through the browser origin.
- Environment configuration is parsed once into a typed contract. Secrets stay
  in ignored `.env.server`; committed example files contain safe placeholders.
- The sample persists a typed item in MongoDB through an authenticated Bifrost
  method, emits an owner-scoped event only after persistence succeeds, and the
  React client refetches canonical state when the event arrives.
- Migrations are versioned, ordered, idempotent at the runner boundary, and run
  before the server accepts application traffic.
- Logging is structured and centralized; application modules do not invent
  incompatible log formats.
- Unit tests cover pure contracts and configuration, integration tests cover
  MongoDB-backed RPC/event behavior, and Vitest Browser covers the React UI's
  event-driven convergence.
- ESLint runs with zero warnings, strict TypeScript rules, React hooks rules,
  import sorting, security checks, Prettier integration, and client/common/server
  import boundaries. Prettier formatting matches ExampleApp's active conventions.

## Test strategy and acceptance criteria

1. Add the split Vitest runners and test setup before the feature implementation.
2. Write unit tests for environment parsing and migration ordering/idempotency.
3. Write an integration test that authenticates a client, creates a MongoDB
   record through Bifrost, observes the scoped update event, and reads the
   canonical list back.
4. Write a browser test that renders the sample React surface, simulates the
   remote update signal, and proves visible state refetches without reload.
5. Run only the new template's affected unit, integration, and browser suites,
   followed by formatting, lint, typecheck, client/server builds, audit, and a
   bounded development/runtime smoke where local services permit.

Acceptance requires a fresh `npm ci` in `template/`, zero lint warnings, no
TypeScript errors, successful client and server builds, passing focused suites,
and README instructions sufficient to start MongoDB and run the template.

## Risks and recovery

- Decorator transforms can differ between TypeScript, Vite, and Vitest. Keep one
  tested Babel decorator plugin boundary across development and test builds.
- A template tied to unpublished source paths would not work for consumers.
  Verify all Bifrost imports use public package exports and that the package lock
  resolves the registry artifact.
- Authentication can overwhelm a starter example. Use a small development
  identity contract with an explicit production replacement seam, never a
  deployment feature flag.
- MongoDB state can leak between tests. Use a dedicated test database and clear
  only template-owned collections.
- If a slice fails, revert its path-limited commit; migrations remain safe
  because application startup runs only committed, ordered migration entries.

## Direct rollout

The template ships directly in the Bifrost repository as documentation-quality
starter code. It does not alter the Bifrost protocol or published runtime and
requires no production migration. Users copy or scaffold from `template/`,
install from the registry, configure `.env.server`, start MongoDB, and run the
development orchestrator.

## Executable checklist

- [ ] Establish package/toolchain, strict configs, split Vitest infrastructure,
      and failing sample-contract tests.
- [ ] Implement typed environment, logging, MongoDB connection, and migration
      runner.
- [ ] Implement authenticated MongoDB-backed Bifrost methods and scoped event.
- [ ] Implement React/Vite client that refetches on the remote event.
- [ ] Add the development orchestrator, proxy, production builds, examples, and
      README.
- [ ] Run focused suites, formatting, lint, typecheck, builds, audit, clean
      install, and runtime smoke.
- [ ] Record the architectural decision and commit each verified unit of work
      with path-limited semantic commits.

