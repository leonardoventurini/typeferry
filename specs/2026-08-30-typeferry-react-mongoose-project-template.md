# TypeFerry React and MongoDB project template

## Problem and scope

Create a runnable, single-package application template at `template/` in the
TypeFerry repository. It should preserve the useful architecture of ExampleApp
without copying product-specific complexity: a development orchestrator, Vite
and React client, Node/TypeFerry server, MongoDB persistence, authentication
baseline, environment validation, structured logging, database migrations, and
a typed real-time sample feature.

The template must include ExampleApp-compatible TypeScript, ESLint, Prettier, and
split Vitest configuration. It is an example consumer of the published
`typeferry-ts` package, not another TypeFerry implementation package. The
initial Mongoose requirement was superseded during implementation in favor of
the official MongoDB driver so change streams remain a native default and the
template avoids a second data abstraction.

## Evidence and uncertainty

- ExampleApp was the initial reference package using Node `24.19.0`, npm
  `11.17.0`, Vite,
  React, a Node watcher plus Vite development orchestrator, path aliases, flat
  ESLint configuration, Prettier, and separate unit/integration/browser Vitest
  runners.
- TypeFerry publishes compiled ESM and public exports from `typeferry-ts/dist`; the
  template must consume those exports rather than source aliases.
- The TypeFerry repository is clean and already owns `specs/` and `decisions/`.
- SCS is not installed in the execution environment, so source inspection uses
  repository-local `rg` searches and direct file reads.
- Local integration verification depends on a reachable MongoDB instance. Tests
  must isolate data and fail with a useful setup message when it is absent.

## Contracts

- `template/` is a standalone ESM npm package with exact Node/npm engine
  requirements and no npm workspace dependency.
- The active template runtime is exact Node `26.5.1` with its bundled npm
  `11.17.0`. Mise remains the only version manager, and both Dockerfiles use
  the matching official Node image without reinstalling npm separately.
- TypeScript uses strict checking, React JSX, bundler resolution, `@/` source
  aliases, decorators compatible with TypeFerry, and separate app/development
  configuration where needed.
- Application and test code lives directly in root-level `client/`, `common/`,
  `server/`, and `test/` directories. There is no intermediate `src/`
  directory, and `@/` resolves to the template root so imports retain their
  existing layer-qualified form, such as `@/server/data/database`.
- The browser-facing Vite server and backend TypeFerry server start together via
  `npm run develop`, shut down cleanly, and proxy TypeFerry HTTP/WebSocket traffic
  through the browser origin.
- A multi-stage production Dockerfile builds both artifacts and runs one
  non-root Node container. The TypeFerry-owned Hono application serves the built
  Vite assets and SPA fallback without intercepting RPC or WebSocket routes.
- A separate development image runs the existing Vite/TypeFerry orchestrator in
  one app container beside the Compose MongoDB service. It bind-mounts the
  host template while overlaying `/app/node_modules` with a container-owned
  Linux volume, and publishes the existing HMR/client and backend ports 8000
  and 8002.
- Environment configuration is parsed once into a typed contract. Secrets stay
  in ignored `.env.server`; committed example files contain safe placeholders.
- The sample persists a typed item through the official MongoDB driver and an authenticated TypeFerry
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
   record through TypeFerry, observes the scoped update event, and reads the
   canonical list back.
4. Write a browser test that renders the sample React surface, simulates the
   remote update signal, and proves visible state refetches without reload.
5. Run only the new template's affected unit, integration, and browser suites,
   followed by formatting, lint, typecheck, client/server builds, audit, and a
   bounded development/runtime smoke where local services permit.
6. Pin the flattened layout in the toolchain unit suite before moving files:
   assert the TypeScript alias maps `@/*` to `*`, the four root-level source
   directories are included, and no `src/` source include remains. Exercise
   all three split runners after the move so their discovery and setup paths
   are proven rather than inferred from configuration text.
7. Change the toolchain unit contract to Node `26.5.1` before updating package
   metadata, and observe the expected failure against the Node 24 manifest.
   Then verify a clean `npm ci`, every affected split suite, static checks,
   builds, and both Docker image runtime versions under Node 26.

Acceptance requires a fresh `npm ci` in `template/`, zero lint warnings, no
TypeScript errors, successful client and server builds, passing focused suites,
and README instructions sufficient to start MongoDB and run the template.

## Risks and recovery

- Decorator transforms can differ between TypeScript, Vite, and Vitest. Keep one
  tested Babel decorator plugin boundary across development and test builds.
- A template tied to unpublished source paths would not work for consumers.
  Verify all TypeFerry imports use public package exports and that the package lock
  resolves the registry artifact.
- Authentication can overwhelm a starter example. Use a small development
  identity contract with an explicit production replacement seam, never a
  deployment feature flag.
- MongoDB state can leak between tests. Use a dedicated test database and clear
  only template-owned collections.
- If a slice fails, revert its path-limited commit; migrations remain safe
  because application startup runs only committed, ordered migration entries.
- Static fallback routing can accidentally swallow protocol paths. Container
  smoke verification must prove the HTML entry, a hashed client asset, the
  health endpoint, and TypeFerry HTTP routing independently.
- The development dependency volume can drift after lockfile changes. Refresh
  it with `npm ci` on container startup and verify Linux-native tooling boots
  without mutating the host dependency tree.
- Flattening can leave stale paths in Vite roots, build entries, watcher
  entries, Vitest discovery, ESLint boundaries, or documentation. Search the
  complete template for `src/` after the move, then verify both production and
  development images because each consumes the same relocated entry points.
- A major Node upgrade can expose native-package, ESM, decorator, or browser
  tooling incompatibilities. Preserve the lockfile unless npm reports a
  metadata change, rebuild both images without relying on old application
  layers, and recover by reverting the path-limited runtime upgrade commit if
  any required suite or runtime smoke fails.

## Direct rollout

The template ships directly in the TypeFerry repository as documentation-quality
starter code. It does not alter the TypeFerry protocol or published runtime and
requires no production migration. Users copy or scaffold from `template/`,
install from the registry, configure `.env.server`, start MongoDB, and run the
development orchestrator.

## Executable checklist

- [x] Establish package/toolchain, strict configs, split Vitest infrastructure,
      and failing sample-contract tests.
- [x] Implement typed environment, logging, MongoDB driver connection, and migration
      runner.
- [x] Implement authenticated MongoDB-backed TypeFerry methods and scoped event.
- [x] Implement React/Vite client that refetches on the remote event.
- [x] Add the development orchestrator, proxy, production builds, examples, and
      README.
- [x] Run focused suites, formatting, lint, typecheck, builds, audit, clean
      install, and runtime smoke.
- [x] Record the architectural decision and commit each verified unit of work
      with path-limited semantic commits.
- [x] Add and verify the multi-stage production Docker image with same-process
      Hono static serving.
- [x] Add and verify the development-only hot-reload image and Compose app
      service using a source bind mount with container-owned dependencies.
- [x] Add a failing toolchain contract for the root-level source layout.
- [x] Promote `client/`, `common/`, `server/`, and `test/` to the template root
      and update every compiler, runner, bundler, watcher, and lint boundary.
- [x] Update template guidance and the architecture decision to make the
      flattened layout the documented default.
- [x] Verify the affected split suites, static checks, builds, Compose
      configuration, production image, and development hot-reload image.
- [x] Pin the runtime contract to Node 26.5.1 with bundled npm 11.17.0.
- [x] Upgrade Mise, package enforcement, production and development images,
      and user guidance without adding another version manager.
- [x] Verify clean installation, split suites, static checks, builds, audit,
      and both image runtime/startup paths under Node 26.5.1.

## Verification evidence

- Mise selected Node 26.5.1 and its bundled npm 11.17.0; `npm ci` completed
  from the committed lockfile.
- Formatting, zero-warning ESLint, strict TypeScript, four unit files with eight
  assertions, the MongoDB replica-set integration suite, and the Chromium
  browser suite passed.
- Vite/Tailwind client and bundled CommonJS Node server builds passed; npm audit
  reported zero vulnerabilities.
- The Compose MongoDB service became a writable `rs0` primary on host port
  27018. The development orchestrator started Vite on 8000 and TypeFerry on 8002,
  connected to MongoDB, ran migrations, served the HTML entry, and forwarded
  `/__h` without proxy failure. Shutdown disconnected MongoDB cleanly.
- The multi-stage image built with exact Node/npm, ran as the non-root `node`
  user without `node_modules`, `.npmrc`, or baked credentials, and became
  healthy against MongoDB. The container served the HTML entry, a hashed Vite
  asset, SPA fallback, `/healthz`, and a non-HTML POST `/__h` response from one
  port, then exited zero on SIGTERM after disconnecting MongoDB.
- The development image installed Linux dependencies into its named volume
  while the host retained Darwin-native packages. Compose started a writable
  `rs0`, served Vite on 8000 and TypeFerry health on 8002, delivered a real Vite
  WebSocket module update after a client edit, rebuilt and restarted the server
  after a backend edit, and exited zero through the orchestrator's SIGINT
  shutdown path. Task-created containers, images, networks, and volumes were
  removed after verification.
- The flattening contract failed first against the legacy `src/*` TypeScript
  alias, then passed after all four source layers moved to the root. All unit,
  replica-set integration, and Chromium browser suites passed from their new
  discovery paths, alongside formatting, zero-warning lint, strict typecheck,
  client/server builds, Compose validation, Just formatting, and a clean
  security audit.
- Fresh production and development image builds consumed the relocated entry
  points. The production container ran as `node`, became healthy, and served
  the built React HTML and hashed assets; the development container installed
  its isolated dependency volume, served Vite's root-level `client/index.html`,
  and reported a healthy MongoDB-backed server. All smoke resources were
  removed afterward.
- The Node 26 contract test failed first against the Node 24 manifest, then
  passed with Node 26.5.1 pinned in Mise, package enforcement, and both
  Dockerfiles. `@types/node` resolved to 26.4.0 through npm, and a frozen install
  completed with zero audit vulnerabilities.
- Unit, replica-set integration, Chromium browser, formatting, zero-warning
  lint, strict typecheck, and both builds passed under Node 26.5.1. Fresh
  production and development images both reported Node 26.5.1 with bundled npm
  11.17.0 and no global npm-install history. Production served healthy static
  and MongoDB-backed routes as `node`; Compose development served Vite and a
  healthy backend before all smoke resources were removed.
