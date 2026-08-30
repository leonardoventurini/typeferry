# Bifrost application template instructions

This directory is a standalone TypeScript application template. Run commands
from `template/`; it is not an npm workspace member of the parent repository.

## Toolchain

- Mise is the only runtime version manager. Keep Node and npm versions in
  `.mise.toml`; do not add `.nvmrc`, `.node-version`, Volta, or asdf files.
- Keep `.npmrc` tracked and credential-free. It owns npm behavior and the
  public Forgejo package scope, not runtime installation.
- Use `mise exec -- npm ...` for reproducible local and agent commands.
- Install dependencies with npm so `package.json` and `package-lock.json` stay
  synchronized. Run `npm audit --audit-level=low` after dependency changes.
- The `justfile` is a convenience interface over npm and Docker. Keep its core
  recipes aligned with package scripts and the documented container command.

## Architecture

- Client code lives in root-level `client/`, portable contracts in `common/`,
  Node-only code in `server/`, and shared test setup in `test/`. There is no
  intermediate `src/` directory. Use `@/` imports, which resolve from the
  template root, and preserve these layer boundaries.
- Application UI is React with Tailwind CSS. Keep `styles.css` as the Tailwind
  entry point and express component styling with utilities rather than adding
  a parallel raw-CSS component system.
- Consume only published `@example-app/bifrost` exports. Never alias or import its
  source tree.
- The official `mongodb` driver is the only database abstraction. Do not add
  Mongoose. Local MongoDB runs as a single-node replica set on host port 27018
  so change streams and transactions work by default.
- Run migrations before accepting Bifrost traffic. Add ordered migrations to
  `server/migrations`; never mutate an already-applied migration.
- Protected persisted changes emit owner-scoped Bifrost events only after the
  database write succeeds. Clients treat events as invalidations and refetch
  authoritative RPC state.
- The sample bearer token is a development seam, not a production identity
  system. Replace it with the application's real authentication contract.
- The production image runs as a non-root user and contains only built output.
  Keep secrets out of image layers, preserve `/healthz`, and verify static,
  RPC, and WebSocket routes whenever container or server routing changes.
- The development image bind-mounts source but keeps `/app/node_modules` on its
  named Linux volume. Do not bind host dependencies into the container or run
  container installs against the host dependency directory.

## Type and quality contracts

- Keep TypeScript strict. Do not add `any`, non-null assertions, unchecked
  index access, or weaker compiler options.
- Keep the flat ESLint and Prettier configurations aligned. Lint runs with zero
  warnings and enforces React hooks, security, type, formatting, and layer
  boundaries.
- Use semantic comments only for non-obvious invariants. Public or complex
  contracts should use multiline JSDoc/TSDoc.

## Tests and verification

- Pure and non-DOM tests use `*.unit.spec.ts(x)` with Vitest Unit.
- MongoDB tests use `*.integration.spec.ts(x)` and the replica-set-backed
  integration setup.
- React and DOM tests use `*.browser.spec.tsx` with Vitest Browser and Chromium;
  never add jsdom.
- Design tests before implementation. Run the affected split suite first, then
  `npm run format:check`, `npm run lint`, `npm run typecheck`, both builds, and
  `npm audit --audit-level=low` before committing.
- Keep commits semantic and path-limited to the unit of work. Do not bypass Git
  hooks unless explicitly instructed.
