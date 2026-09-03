# Changelog

## 0.9.0

- Add typed `build.server.external` configuration for packages that must
  remain outside development and production server bundles.
- Require every configured server external to be a direct application
  production dependency so pruned runtime installs remain deterministic.

## 0.8.0

- Add zero-config `typeferry develop`, `typeferry build`, and
  `typeferry test` application commands.
- Add optional typed application configuration through `typeferry/config`.
- Mirror the installed Vitest API through the explicitly unstable
  `typeferry/test` entry point.
- Preserve existing runtime exports without application-tooling imports.

## 0.5.0

- Add optional application-owned WebSocket handshake authentication while
  preserving token authentication as the default.
- Keep handshake rejection, timeout, and errors fail-closed without token
  fallback.
