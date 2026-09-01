# Changelog

## 0.5.0

- Add optional application-owned WebSocket handshake authentication while
  preserving token authentication as the default.
- Keep handshake rejection, timeout, and errors fail-closed without token
  fallback.
