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
MongoDB on 27017.

## Start the template

```sh
mise install
mise exec -- npm ci
cp .env.server.example .env.server
docker compose up -d mongodb
mise exec -- npm run develop
```

Open <http://localhost:8000>. Vite serves the React client and proxies Bifrost
HTTP traffic to the backend on port 8002. WebSocket traffic connects directly
to port 8002 during development.

The Compose service initializes a single-node `rs0` replica set. The example
connection uses `directConnection=true`, enabling change streams and
transactions while keeping local member discovery stable.

## Sample architecture

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

```sh
mise exec -- npm run develop          # Vite + watched Node backend
mise exec -- npm run test:unit        # pure/config tests
mise exec -- npm run test:integration # replica-set MongoDB tests
mise exec -- npm run test:browser     # Chromium React tests
mise exec -- npm run typecheck
mise exec -- npm run lint
mise exec -- npm run format:check
mise exec -- npm run build
mise exec -- npm audit --audit-level=low
```

Integration tests use an isolated in-memory replica set and do not modify the
Compose database. Browser tests run in a real headless Chromium environment,
not jsdom.

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
entry to `dist/server/index.js`. Run the server with:

```sh
mise exec -- npm start
```

Serve `dist/client` with your preferred static hosting boundary and configure
the client to reach the deployed Bifrost origin. Keep `.env.server` and all
real credentials out of version control.
