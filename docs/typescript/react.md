# React Integration

The React adapter provides a client context plus hooks for RPC state, subscriptions, remote events, and connection status.

## Provide one client

```tsx
// client/app.tsx
import { ClientProvider } from 'typeferry-ts/react'

export function App(): React.JSX.Element {
  return (
    <ClientProvider
      clientOptions={{
        host: window.location.hostname,
        port: 8002,
        initialContext: { token: 'development-only-token' },
      }}
    >
      <Greeting />
    </ClientProvider>
  )
}
```

You can pass `clientInstance` instead when the application owns client construction. Do not create a new instance on every render.

## Fetch method state

```tsx
import { useMethod } from 'typeferry-ts/react'

function Greeting(): React.JSX.Element {
  const greeting = useMethod({
    method: 'greeting.hello',
    params: { name: 'Ada' },
    defaultValue: '' as string,
  })

  if (greeting.loading) return <p>Loading…</p>
  if (greeting.error) return <p role="alert">Request failed</p>

  return <p>{greeting.result}</p>
}
```

`useMethod` also supports lazy calls, debouncing, cache controls, HTTP calls, authentication gating, and event-driven refresh. Treat its result as server-authoritative state.

Use `useRemoteEvent` for an explicit event callback and `useSubscribe` when subscription lifecycle should follow component lifecycle. The template's [`messages` UI](../../template/client/) demonstrates mutation followed by private-channel invalidation and refetch.

Connection state includes reconnecting as well as online, offline, and connecting states; interfaces should avoid presenting a reconnect as a completed logout.
