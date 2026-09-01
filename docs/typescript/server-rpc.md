# TypeScript Server and RPC

TypeFerry's TypeScript server runs on Node.js and exposes the same registered methods over HTTP and WebSocket. Import only from the package's public server entry points.

## Create a server

```ts
// server/index.ts
import { Server } from 'typeferry/server'

export const server = new Server({
  host: '127.0.0.1',
  port: 8002,
  allowedContextKeys: ['token'],
})

await server.isReady()
```

The server owns its Hono application and Node HTTP listener. Its WebSocket transport attaches before the listener accepts traffic. Shut down cleanly with `await server.close()`.

## Register a namespace

```ts
// server/methods/greeting.ts
import type { ClientNode } from 'typeferry/server'
import {
  Method,
  Namespace,
  Protected,
  registerNamespace,
} from 'typeferry/server/decorators'

interface GreetingInput {
  name: string
}

@Namespace('greeting')
class GreetingMethods {
  @Method()
  @Protected()
  hello(_client: ClientNode, input: GreetingInput): string {
    return `Hello, ${input.name}`
  }
}

registerNamespace(GreetingMethods)
```

The client calls this method as `greeting.hello`. Decorators also support middleware, schemas, and caching. Keep shared parameter/result interfaces in application-owned portable modules so server and TypeScript clients use the same contract.

`@Protected()` requires configured authentication; it is not a substitute for authorization inside a method. Validate that the authenticated principal may access the requested resource.

## Errors, validation, and caching

- Throw only intentionally public errors when details may cross the wire; log internal failures on the server.
- Attach a schema when runtime input validation is required. TypeScript types alone do not validate network input.
- Cache only reads whose key captures every identity and input dimension that affects the result.
- Use HTTP for isolated calls and WebSocket for connection-aware behavior. The method contract remains the same.

The runnable implementation is in [`template/server`](../../template/server/). See [authentication](authentication.md), [events and channels](events-and-channels.md), and the normative [protocol](../../PROTOCOL.md).
