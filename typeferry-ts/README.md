# typeferry-ts

The TypeScript implementation of TypeFerry provides the reference Node.js server, browser/Node client, React hooks, authentication helpers, EJSON, and an optional MongoDB extension.

> [!IMPORTANT]
> `typeferry-ts` is not published to npm. The repository package is intentionally private while its final registry identity is selected. Use the repository-local [`template/`](../template/) workflow described in the [quickstart](../docs/getting-started.md).

## Runtime requirements

- Node.js `24.19.0`
- npm `11.17.0`
- Node.js for the server runtime
- A browser or WebSocket-capable JavaScript runtime for clients

## Public entry points

| Import | Purpose |
|---|---|
| `typeferry-ts/server` | Server, methods, events, channels, and runtime types |
| `typeferry-ts/server/decorators` | Namespace and method decorators |
| `typeferry-ts/server/transports` | Node HTTP, WebSocket, and Redis transports |
| `typeferry-ts/client` | Core client and connection APIs |
| `typeferry-ts/react` | React provider and hooks |
| `typeferry-ts/auth` | Shared auth, token, session, and cookie helpers |
| `typeferry-ts/auth/server/oauth` | Server OAuth providers |
| `typeferry-ts/auth/client/oauth` | Client OAuth helpers |
| `typeferry-ts/ejson` | Extended JSON namespace |
| `typeferry-ts/mongodb` | Native-driver MongoDB extension |
| `typeferry-ts/mongodb/decorators` | MongoDB collection decorators |

Applications should import these compiled package exports. Do not alias or import `typeferry-ts/src` from application code.

## Minimal local server

```ts
import { Server } from 'typeferry-ts/server'
import type { ClientNode } from 'typeferry-ts/server'
import {
  Method,
  Namespace,
  registerNamespace,
} from 'typeferry-ts/server/decorators'

@Namespace('system')
class SystemMethods {
  @Method()
  ping(_client: ClientNode): string {
    return 'pong'
  }
}

const server = new Server({ host: '127.0.0.1', port: 8002 })
registerNamespace(SystemMethods)
await server.isReady()
```

The `Server` constructor installs Node HTTP and WebSocket transports. Call `server.close()` during graceful shutdown.

## Development

Run commands from `typeferry-ts/`:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

## Guides

Start at the [documentation home](../docs/README.md) or jump to [server and RPC](../docs/typescript/server-rpc.md), [client](../docs/typescript/client.md), [React](../docs/typescript/react.md), [authentication](../docs/typescript/authentication.md), [events and channels](../docs/typescript/events-and-channels.md), [MongoDB](../docs/typescript/mongodb.md), [EJSON](../docs/typescript/ejson.md), or [deployment](../docs/typescript/deployment.md).
