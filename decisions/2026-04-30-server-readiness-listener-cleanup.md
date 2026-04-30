# Server Readiness Listener Cleanup

## Context

Production logs showed repeated `[Bifrost] Listener count exceeded for "ready"`
warnings while the server appeared slow to respond. The warning came from
Bifrost's browser-safe event emitter and indicated that `READY` listeners were
accumulating.

`Server.isReady()` resolved immediately when `server.ready` was already true,
but it continued to register a one-shot `READY` listener after resolving. Since
the `READY` event had already fired, those listeners could not be cleaned up.
Repeated readiness checks after startup therefore created a listener leak.

## Decision

`Server.isReady()` now returns after immediate resolution when the server is
already ready. This preserves the public promise contract while ensuring the
ready path remains a low-cost guard for request handling and application boot
checks.

## Verification

A server unit regression test asserts that repeated already-ready `isReady()`
calls leave the `READY` listener count at zero.
