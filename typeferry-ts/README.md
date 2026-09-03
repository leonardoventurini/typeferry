# typeferry

The TypeScript implementation of TypeFerry provides the reference Node.js server, browser/Node client, React hooks, authentication helpers, EJSON, and an optional MongoDB extension.

Install the public TypeScript package with `npm install typeferry`. Repository contributors can use the local [`template/`](../template/) workflow described in the [quickstart](../docs/getting-started.md).

AI coding agents building consumer applications should begin with the
[agent application guide](https://github.com/leonardoventurini/typeferry/blob/main/docs/agents/application-development.md).
It defines the supported project structure, public imports, package-owned
commands, optional configuration, safety boundaries, and completion checks.

## Runtime requirements

- Node.js `24.19.0`
- npm `11.17.0`
- Node.js for the server runtime
- A browser or WebSocket-capable JavaScript runtime for clients

## Public entry points

| Import | Purpose |
|---|---|
| `typeferry/server` | Server, methods, events, channels, and runtime types |
| `typeferry/server/decorators` | Namespace and method decorators |
| `typeferry/server/transports` | Node HTTP, WebSocket, and Redis transports |
| `typeferry/client` | Core client and connection APIs |
| `typeferry/react` | React provider and hooks |
| `typeferry/auth` | Shared auth, token, session, and cookie helpers |
| `typeferry/auth/server/oauth` | Server OAuth providers |
| `typeferry/auth/client/oauth` | Client OAuth helpers |
| `typeferry/ejson` | Extended JSON namespace |
| `typeferry/mongodb` | Native-driver MongoDB extension |
| `typeferry/mongodb/decorators` | MongoDB collection decorators |
| `typeferry/config` | Optional typed application configuration |
| `typeferry/test` | Unstable mirror of the installed Vitest API |

Applications should import these compiled package exports. Do not alias or import TypeFerry source files from application code.

## Application commands

Applications using the conventional root-level `client/`, `common/`,
`server/`, and `test/` directories need no TypeFerry configuration:

```json
{
  "scripts": {
    "develop": "typeferry develop",
    "build": "typeferry build",
    "test": "typeferry test"
  }
}
```

`typeferry test unit`, `typeferry test integration`, and
`typeferry test browser` select one project. Add `--watch` for watch mode.
Tests can import Vitest through `typeferry/test`:

```ts
import { describe, expect, it } from 'typeferry/test'
```

That entry point mirrors TypeFerry's installed Vitest release. Individual
mirrored exports follow Vitest and do not carry independent TypeFerry
compatibility guarantees.

Add `typeferry.config.ts` only when overriding supported high-level defaults:

```ts
import { defineConfig } from 'typeferry/config'

export default defineConfig({
  development: {
    clientPort: 8000,
    serverPort: 8002,
  },
})
```

## Define and serve a typed method

```ts
import { Server } from 'typeferry/server'
import type { ClientNode } from 'typeferry/server'
import {
  type InferNamespace,
  Method,
  Namespace,
  registerNamespace,
  Schema,
} from 'typeferry/server/decorators'
import { z } from 'zod'

const greetingSchema = z.object({
  name: z.string().trim().min(1),
})

type GreetingInput = z.infer<typeof greetingSchema>

@Namespace('greeting')
export class GreetingMethods {
  @Method()
  @Schema(greetingSchema)
  async hello(
    _client: ClientNode,
    input: GreetingInput,
  ): Promise<string> {
    return `Hello, ${input.name}!`
  }
}

export type GreetingApi = InferNamespace<GreetingMethods, 'greeting'>

const server = new Server({ host: '127.0.0.1', port: 8002 })
registerNamespace(GreetingMethods)
await server.isReady()
```

Clients can call the method as `client.m.greeting.hello({ name: 'Ada' })` when parameterized with `GreetingApi`. The decorators turn the class method into an HTTP and WebSocket RPC endpoint, while `@Schema()` validates network input at runtime. The `Server` constructor installs both transports; call `server.close()` during graceful shutdown.

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
