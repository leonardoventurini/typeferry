# Bifrost project template architecture

## Context

The Bifrost repository needed a small but production-minded application starter
based on ExampleApp's useful architectural boundaries. During implementation the
requested persistence layer changed from Mongoose to the official MongoDB
driver, local MongoDB was required to support change streams by default, Mise
was selected as the sole runtime manager, and the client styling moved to the
latest Tailwind CSS.

## Decision

- Keep `template/` as a standalone npm package rather than adding it to a root
  workspace.
- Keep application code in root-level `client/`, `common/`, `server/`, and
  `test/` directories rather than nesting it under `src/`. Map `@/` to the
  template root so imports preserve explicit architectural layer names.
- Use Mise alone to install/select exact Node 24.19.0 and npm 11.17.0. Keep a
  credential-free tracked `.npmrc` for npm policy and Forgejo scope metadata.
  Provide a small `justfile` as a command alias layer without making Just a
  runtime or package manager.
- Use the official MongoDB driver with a single process-wide `MongoClient` and
  typed collection accessors. Local Compose and integration tests use a
  single-node `rs0` replica set; Compose publishes it on host port 27018.
- Use protected Bifrost methods and owner-scoped events. Events invalidate
  client state, and React refetches the canonical RPC result after delivery.
- Use React and Tailwind CSS 4 through Vite. Component visuals use Tailwind
  utilities; the CSS entry contains only the Tailwind import.
- Keep strict TypeScript, flat zero-warning ESLint, Prettier with the Tailwind
  plugin, and separate unit, MongoDB integration, and real-browser Vitest
  runners.
- Bundle the Node server and transitive runtime dependencies into CommonJS for
  development and production. This preserves interoperability with a
  CommonJS-only transitive package currently consumed by the published Bifrost
  artifact while application source and package configuration remain ESM.
- Build a multi-stage production image and run only the built output as the
  non-root Node user. The Bifrost-owned Hono app serves Vite assets, SPA
  fallback, health, RPC, and WebSocket traffic from one container and port.
- Use a separate development image for the existing Vite/Bifrost orchestrator.
  Compose bind-mounts source, overlays `/app/node_modules` with a Linux-owned
  named volume refreshed by `npm ci`, and runs beside the MongoDB replica set.

## Rejected alternatives

- Mongoose was rejected after the requirement changed because it duplicates the
  driver's type/runtime layer and is unnecessary for the small typed collection
  boundary.
- A standalone MongoDB server was rejected because it prevents change streams
  and transactions from working in the default local environment.
- Additional runtime manager files were rejected because they can disagree with
  Mise and make tool selection ambiguous.
- Raw component CSS was rejected in favor of Tailwind utilities and the Vite
  plugin requested for the starter.
- An intermediate `src/` directory was rejected because the template already
  has explicit layer directories and the extra level adds navigation depth
  without clarifying ownership.
- Running the published Bifrost ESM output directly was rejected after the real
  startup smoke exposed a named-export incompatibility in a CommonJS transitive
  dependency. Bundling resolves that boundary without patching Bifrost or its
  installed output.

## Rationale

These choices leave one obvious path for each concern: Mise for tools, npm for
packages, MongoDB driver for persistence, Bifrost for typed transport/events,
React for UI, Tailwind for styling, and split Vitest runners for evidence. The
template stays small while exercising the same security, migration, real-time,
and lifecycle boundaries expected from a real consumer.

## Consequences

- Consumers must replace the documented development bearer token before
  production use.
- MongoDB must run as a replica set, even for local development.
- The server artifact is larger because dependencies are bundled, but startup
  is deterministic and does not depend on Node synthesizing named exports from
  transitive CommonJS modules.
- Container health represents MongoDB readiness, and deployments must inject
  environment configuration rather than copying secrets into image layers.
- Development-container startup reinstalls the locked dependency graph into its
  named volume. This costs startup time but prevents macOS native packages from
  entering the Linux container or Linux packages overwriting the host.
- Future migrations must fit within or renew the current five-minute database
  lease.
- Path-sensitive tools must enumerate the root-level application directories;
  new source layers require coordinated TypeScript, ESLint, Vite, and Vitest
  updates.
- Updating Node/npm, Tailwind, MongoDB, or Bifrost requires coordinated manifest,
  lockfile, test, build, and runtime-smoke verification.
