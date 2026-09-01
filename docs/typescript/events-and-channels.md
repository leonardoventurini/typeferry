# Events and Channels

Events notify connected clients that something happened. Channels scope delivery; durable application state should still come from an RPC read or database.

## Register and emit

```ts
// server/events.ts
import type { Server } from 'typeferry/server'

export const MESSAGE_CHANGED = 'messages:changed'

export function configureEvents(server: Server): void {
  server.addEvent(MESSAGE_CHANGED, { user: true })
}

export function announceMessageChange(
  server: Server,
  ownerId: string,
): void {
  server.channel(ownerId).emit(MESSAGE_CHANGED, { ownerId })
}
```

Use a shared constant for each event name. A private channel name should derive from authenticated server state, not untrusted request data. Configure `shouldSubscribe` or equivalent authorization so clients cannot join another user's channel.

Event options can enforce authenticated use, control subscription, exclude the originator, and enable cluster propagation. Redis transport is appropriate when multiple server processes must fan out the same event.

On React, `useRemoteEvent` can handle an event directly, while `useMethod` can associate an event/channel with a refetch. Prefer invalidation plus authoritative refetch over treating an event payload as a durable replica.

See the template's [`messages` server methods](../../template/server/methods/messages.ts) and [React guide](react.md).
