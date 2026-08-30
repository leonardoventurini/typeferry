# Bifrost React + MongoDB template

A production-minded starter for a typed Bifrost application. It includes a
React and Tailwind client, Vite development server, Node/Bifrost backend,
official MongoDB driver, protected RPC methods, owner-scoped real-time events,
ordered migrations, structured logs, and split Vitest coverage.

## Requirements

- [Mise](https://mise.jdx.dev/)
- Docker with Compose

The project pins Node 24.19.0 and npm 11.17.0 through `.mise.toml`. MongoDB is
published on host port 27018 to avoid colliding with a conventional local
MongoDB on 27017. The commands below assume Mise's shell activation is enabled;
in non-interactive automation, prefix them with `mise exec --`.

## Start the template

```sh
mise install
npm ci
cp .env.server.example .env.server
docker compose up -d mongodb
npm run develop
```

Open <http://localhost:8000>. Vite serves the React client and proxies Bifrost
HTTP traffic to the backend on port 8002. WebSocket traffic connects directly
to port 8002 during development.

The Compose service initializes a single-node `rs0` replica set. The example
connection uses `directConnection=true`, enabling change streams and
transactions while keeping local member discovery stable.

## Sample architecture

Application code is intentionally flat beneath the project root: React lives
in `client/`, portable contracts in `common/`, Node-only code in `server/`, and
shared test setup in `test/`. The `@/` alias resolves to the project root, so
layer-qualified imports such as `@/common/messages` remain explicit without an
intermediate `src/` directory.

The `messages` namespace demonstrates the intended flow:

1. The Bifrost server authenticates the development token and exposes protected
   `messages.list` and `messages.create` methods.
2. `messages.create` inserts through the official MongoDB driver.
3. After the acknowledged write, the server emits `messages:changed` on the
   authenticated owner's private channel.
4. React receives the event through `useRemoteEvent` and refetches the
   authoritative list instead of treating the event payload as durable state.

The committed token is intentionally limited to local template development.
Replace this seam with the application's real authentication provider before
shipping.

## Commands

The core workflow is available through `just`:

```sh
just install
just develop
just test
just lint
just typecheck
just build
just docker-build
just docker-run
just docker-develop
```

The recipes delegate to the same npm and Docker commands shown below, so either
interface remains suitable for automation.

```sh
npm run develop          # Vite + watched Node backend
npm run test:unit        # pure/config tests
npm run test:integration # replica-set MongoDB tests
npm run test:browser     # Chromium React tests
npm run typecheck
npm run lint
npm run format:check
npm run build
npm audit --audit-level=low
```

Integration tests use an isolated in-memory replica set and do not modify the
Compose database. Browser tests run in a real headless Chromium environment,
not jsdom.

## Development container

Run the Vite and Bifrost hot-reload orchestrator with its MongoDB replica set:

```sh
just docker-develop
```

Compose bind-mounts the repository into `/app`, so client and server edits are
visible immediately. A named volume overlays `/app/node_modules`; the container
runs `npm ci` into that Linux-owned volume before starting, keeping native Linux
packages separate from macOS dependencies. Vite HMR is available on port 8000
and the Bifrost backend on port 8002.

Stop the stack with `docker compose down`. Use `docker compose down --volumes`
only when you intentionally want to discard both MongoDB data and the cached
container dependency tree.

## Environment

Server configuration is validated at startup:

- `CLIENT_ORIGIN`: allowed browser origin.
- `DATABASE_URL`: MongoDB replica-set connection string.
- `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.
- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: Bifrost HTTP/WebSocket port.
- `SAMPLE_AUTH_TOKEN`: development authentication token, at least 16 characters.

The client uses `VITE_SERVER_PORT` and `VITE_SAMPLE_AUTH_TOKEN` when provided;
their development defaults match `.env.server.example`.

## Production build

`npm run build` writes the Vite client to `dist/client` and bundles the Node
entry and its runtime dependencies to `dist/server/index.cjs`. Bundling keeps
CommonJS-only transitive packages interoperable with the Node server while the
application source remains ESM. Run the server with:

```sh
npm start
```

`npm start` serves `dist/client` and Bifrost from the same Node process. Keep
`.env.server` and all real credentials out of version control.

## Production container

The multi-stage Docker image builds the React client and bundled Node server,
then copies only `dist` into a non-root runtime image. Bifrost's Hono app serves
the Vite assets, SPA routes, `/healthz`, RPC, and WebSocket traffic on one port.

```sh
docker build -t bifrost-template .
docker run --rm \
  --add-host host.docker.internal:host-gateway \
  --env-file .env.server \
  --env CLIENT_ORIGIN=http://localhost:8002 \
  --env 'DATABASE_URL=mongodb://host.docker.internal:27018/bifrost-template?replicaSet=rs0&directConnection=true' \
  --publish 8002:8002 \
  bifrost-template
```

Container environments should inject configuration through Docker or the
deployment platform; `.env.server` is not copied into the image. `/healthz`
checks the live MongoDB connection and drives the image health check.
