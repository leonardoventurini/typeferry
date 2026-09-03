# Synchronous WebSocket Retirement

## Context

`VisibilityManager.reconnect()` previously closed a WebSocket and cleared the
active socket reference before its asynchronous close handler ran. The stale
socket guard then correctly ignored the old handler, but this also skipped
pending-RPC rejection and the `WEBSOCKET_CLOSED` lifecycle event.

MongoDB live views use that event to advance their connection epoch and clear
an in-flight subscription. Replacing a connection during authorization could
therefore leave the old subscribe promise attached to the view, preventing the
new authenticated connection from subscribing. The server eventually reported
only the intentionally redacted sensitive-method failure.

## Decision

Immediate replacement retires the active connection synchronously through
`ClientSocket.retireConnection()` before `connect()` opens a successor.
Retirement clears reconnect timers, rejects pending acknowledgements, detaches
the old socket handlers, closes the socket, and emits `WEBSOCKET_CLOSED`
exactly once. Both visibility recovery and context-driven reauthentication use
this path.

The wire protocol, authentication policy, sensitive telemetry redaction, and
stale-socket identity guards remain unchanged.

## Rejected alternatives

- Waiting for the old socket's asynchronous close handler was rejected because
  immediate reconnect callers intentionally supersede that socket and must not
  let a late handler mutate the new connection.
- Adding retry loops only to MongoDB live views was rejected because every
  pending connection-owned RPC needs the same retirement boundary.
- Exposing sensitive subscription exceptions was rejected because it would
  weaken the existing telemetry boundary without fixing lifecycle ownership.

## Consequences

- Pending RPCs fail immediately with `Connection lost` during deliberate
  replacement instead of waiting for acknowledgement timeout.
- Live views can discard the old connection epoch and establish a fresh
  protected subscription after authentication.
- Callers that replace a socket must use the centralized retirement method;
  directly clearing `ClientSocket.socket` would reintroduce the defect.
- Rollback is a normal commit revert; no persisted state or wire migration is
  involved.
