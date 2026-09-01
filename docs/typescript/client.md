# TypeScript Client

The core client works independently of React and can use WebSocket or HTTP calls against a TypeFerry server.

```ts
// client/typeferry.ts
import { Client } from 'typeferry-ts/client'

export const client = new Client({
  host: window.location.hostname,
  port: 8002,
  httpPort: 8002,
  secure: window.location.protocol === 'https:',
  initialContext: { token: 'development-only-token' },
})
```

Only context keys allowed by the server are accepted. Never place long-lived credentials in source code or a WebSocket URL; the token above illustrates local development only.

## Call a method

```ts
interface GreetingInput {
  name: string
}

interface GreetingResult {
  message: string
}

const result = await client.call<GreetingInput, GreetingResult>(
  'greeting.hello',
  { name: 'Ada' },
)
```

Use `client.void(...)` when no result is needed. Call options can select HTTP behavior, caching, and other per-call controls; keep transport selection at the application boundary instead of duplicating method names.

## Lifecycle

Create one client per browser application unless isolation is intentional. Observe its connection state, handle rejected promises, and close application-owned clients during teardown. For React UI state, prefer the [React hooks](react.md), which reuse this client rather than replacing it. Other UI frameworks can integrate directly with the framework-agnostic client lifecycle.

For live updates, see [events and channels](events-and-channels.md). For identity context and reconnection behavior, see [authentication](authentication.md).
