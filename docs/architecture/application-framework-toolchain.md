# TypeFerry application framework and toolchain proposal

Status: proposed architecture. This document is informative and does not
supersede accepted decisions, package contracts, or the wire protocol.

## Summary

TypeFerry should make its existing application conventions explicit and
versioned inside the `typeferry` npm package. Applications should describe
their intent in `typeferry.config.ts`; the package should translate that model
into development, build, test, type-checking, linting, formatting, Docker, and
Compose behavior.

The intended application surface is:

```text
my-app/
├── client/
├── common/
├── server/
├── test/
├── package.json
├── package-lock.json
└── typeferry.config.ts
```

The existing `client/`, `common/`, `server/`, and `test/` boundaries remain the
default. A typical application should not own `develop.ts`, `vite.config.ts`,
three Vitest configurations, or copied tool configuration.

## Goals

- Provide one batteries-included TypeFerry application workflow.
- Standardize the established application directory structure.
- Make a TypeFerry upgrade update the compatible toolchain as a unit.
- Keep common applications close to zero-configuration.
- Provide typed, intentional extension points without making every underlying
  tool option part of TypeFerry's stable API.
- Preserve advanced escape hatches and an explicit ejection path.
- Keep the wire protocol and cross-language implementations unchanged.

## Non-goals

- Hide the behavior or native APIs of application dependencies such as React
  and MongoDB.
- Make Vite, Vitest, ESLint, Prettier, Docker, or Compose public TypeFerry
  compatibility contracts in their entirety.
- Remove small project-root integration files when Git, npm, Mise, Docker, or
  editors require them before TypeFerry can run.
- Move application policy into the portable runtime or wire protocol.

## User-facing workflow

Applications use the package CLI for all framework-owned operations:

```json
{
  "dependencies": {
    "typeferry": "^0.8.0"
  },
  "scripts": {
    "develop": "typeferry develop",
    "build": "typeferry build",
    "start": "typeferry start",
    "test": "typeferry test",
    "typecheck": "typeferry typecheck",
    "lint": "typeferry lint",
    "format": "typeferry format",
    "container:build": "typeferry container build",
    "compose:up": "typeferry compose up"
  }
}
```

The default configuration can be empty:

```ts
import { defineConfig } from 'typeferry/config'

export default defineConfig({})
```

`typeferry.config.ts` describes application intent. It is not a renamed Vite
configuration file.

## Package architecture

The existing `typeferry` package gains five internally isolated layers:

```text
typeferry
├── runtime
│   ├── client
│   ├── server
│   ├── react
│   └── mongodb
├── config
│   ├── schema and defineConfig()
│   ├── defaults
│   ├── validation
│   └── resolved application model
├── toolchain
│   ├── Vite and server compiler
│   ├── Vitest
│   ├── TypeScript
│   ├── ESLint
│   └── Prettier
├── container
│   ├── production image recipe
│   ├── development image recipe
│   └── Compose model
└── CLI
    ├── develop, build, and start
    ├── test, lint, format, and typecheck
    ├── container and compose
    └── doctor, sync, migrate, and eject
```

Runtime exports must never import toolchain modules. Toolchain dependencies
must load lazily so browser and server consumers do not execute or bundle CLI
code. Package inspection must verify that client bundles contain no toolchain
implementation.

## Configuration model

The CLI resolves the project root, loads and validates
`typeferry.config.ts`, applies conventions, and produces one immutable
`ResolvedTypeFerryConfig`. Every subsystem consumes that model rather than
independently rediscovering paths and defaults.

An illustrative configuration is:

```ts
import { defineConfig } from 'typeferry/config'

export default defineConfig({
  app: {
    client: 'client',
    common: 'common',
    server: 'server',
    tests: 'test',
    output: 'dist',
  },
  development: {
    clientPort: 8000,
    serverPort: 8002,
    serverEnvironmentFile: '.env.server',
  },
  build: {
    target: 'es2023',
    sourceMaps: true,
  },
  test: {
    unit: true,
    integration: {
      enabled: true,
      timeout: 30_000,
    },
    browser: {
      enabled: true,
      browser: 'chromium',
    },
  },
  container: {
    nodeImage: 'node:26.5.1-bookworm-slim',
    database: {
      provider: 'mongodb',
      version: '8',
      replicaSet: true,
      hostPort: 27018,
    },
  },
})
```

The initial public configuration should be narrow and strongly typed. Stable
fields should express TypeFerry concepts, not pass through raw tool settings.

### Extension stability

Configuration extensions have two stability levels:

- Normal fields are durable TypeFerry APIs with semantic-versioning
  expectations.
- Fields under `advanced` are explicit integration escape hatches coupled to
  the underlying tool and may need adjustment when its major version changes.

For example:

```ts
export default defineConfig({
  build: {
    aliases: {
      '~shared': './common',
    },
  },
  advanced: {
    vite({ config }) {
      return config
    },
  },
})
```

An unrestricted Vite object must not appear at the top level. Doing so would
make Vite's complete configuration surface an accidental TypeFerry public
contract and impede coordinated upgrades.

## Development and production builds

`typeferry develop` replaces the template's development script and owns:

- Vite startup with automatic Vite configuration discovery disabled.
- React and Tailwind integration.
- The TypeFerry HTTP development proxy.
- Backend compilation and watch mode.
- Backend process restarts and process-tree cleanup.
- Tagged output and development logging.
- Signal handling and graceful shutdown.
- Default ports and server environment loading.
- Client, common, server, and root-alias resolution.

`typeferry build` performs explicit internal stages:

```text
validate structure and configuration
    ↓
clean framework-managed output
    ↓
build client into dist/client
    ↓
bundle server into dist/server/index.cjs
    ↓
validate the client manifest
    ↓
write dist/typeferry-build.json
```

The build metadata records the TypeFerry version, configuration schema,
entries, target, and generated artifacts. `typeferry start` validates this
metadata and reports incompatible or incomplete output before starting the
server.

## Tests

The package should replace the three template-owned Vitest files with named
inline projects:

```sh
typeferry test
typeferry test unit
typeferry test integration
typeferry test browser
typeferry test --watch
```

The existing conventions remain observable contracts:

- `*.unit.spec.ts(x)` runs in the Node unit project.
- `*.integration.spec.ts(x)` runs serially with MongoDB setup and decorator
  transformation.
- `*.browser.spec.tsx` runs with Playwright Chromium, React, and Tailwind.
- Application setup files augment rather than accidentally replace mandatory
  framework setup.
- Every project has an explicit stable name.

Applications must not rely on npm hoisting to import a transitive Vitest
installation. To retain the single-dependency workflow, TypeFerry should
export the supported test API:

```ts
import { describe, expect, it } from 'typeferry/test'
```

Testing Library or other broad testing APIs may remain application
dependencies when singleton behavior or their complete public API is needed.

## TypeScript, ESLint, and Prettier

The CLI can run all three tools with package-owned configuration. Editor and
third-party-tool discovery still benefits from small project-root adapters.

TypeFerry should export:

- `typeferry/tsconfig`
- `typeferry/tsconfig/client`
- `typeferry/tsconfig/server`
- `typeferry/tsconfig/test`
- `typeferry/eslint`
- `typeferry/prettier`

A root TypeScript adapter can remain as small as:

```json
{
  "extends": "typeferry/tsconfig"
}
```

An optional ESLint editor adapter can re-export `typeferry/eslint`. The
application manifest can point Prettier-compatible editors at
`typeferry/prettier`.

Formatting and linting should be separate operations rather than running
Prettier as an ESLint rule:

```sh
typeferry lint
typeferry format
typeferry check
```

This reduces plugin coupling and produces clearer diagnostics.

## Managed integration files

Some files affect tools before the TypeFerry package can execute. They cannot
all disappear:

| File | Policy | Reason |
|---|---|---|
| `.prettierrc` | Remove | Package configuration can own it. |
| `.prettierignore` | Remove | Derive exclusions from resolved config. |
| `.npmrc` | Keep minimal | npm reads it before installing TypeFerry. |
| `.mise.toml` | Keep | Mise selects Node before TypeFerry runs. |
| `.gitignore` | Keep or generate | Git does not consult npm package config. |
| `.dockerignore` | Keep or generate | Docker reads it from the context root. |
| `eslint.config.*` | Optional adapter | Editors may require discovery. |
| `tsconfig.json` | Keep tiny adapter | Editors require project discovery. |

In this model, TypeFerry owns canonical content, validation, and updates even
when a physical adapter must remain in the project.

`typeferry sync` creates or refreshes managed integration sections, while
`typeferry sync --check` verifies them without changing files. Managed files
must carry boundaries such as:

```text
# typeferry:start
...framework-managed content...
# typeferry:end
```

The command must preserve application-owned content and refuse ambiguous
rewrites.

## Docker and Compose

Container operations should be package CLI commands:

```sh
typeferry container build
typeferry container run
typeferry compose up
typeferry compose down
typeferry compose logs
```

Docker still requires the application directory as its build context. The CLI
therefore renders versioned artifacts into `.typeferry/generated/` and invokes
Docker using the application root as the context. It must not execute a
Compose file directly from `node_modules/typeferry`, where relative paths
would resolve incorrectly and upgrades could replace local customization.

Generated container assets are disposable and not committed. They record the
TypeFerry and schema versions that created them.

Framework defaults preserve the current template behavior:

- A multi-stage production build.
- A non-root production process containing built output only.
- A health check against `/healthz`.
- A separate development image.
- A Linux-owned development `node_modules` volume.
- A MongoDB single-node replica set with persistent storage.
- Development dependencies ordered on database health.
- The current client, server, and MongoDB host ports.

Common variation belongs in `typeferry.config.ts`. Infrastructure outside the
supported model uses `typeferry eject docker`, which copies editable assets to
the application and ends framework management of those files.

## Upgrades and migrations

The target upgrade workflow is:

```sh
npm install typeferry@latest
typeferry migrate
typeferry sync
typeferry check
```

TypeFerry exposes three version concepts:

- Runtime version for public runtime behavior.
- Configuration schema version.
- Generated-artifact version.

`typeferry migrate` reads the installed version and configuration schema,
reports breaking changes, applies safe transformations, refreshes managed
adapters, re-renders disposable container assets, and optionally runs the
complete verification surface.

Package-lock updates must not silently change security, ports, build output,
container behavior, or test semantics. Material default changes remain
compatible or require an explicit migration.

Applications commit their configuration, minimal adapters, manifest, and
lockfile. They do not commit `.typeferry/generated/`.

## Dependency consequences

Keeping the runtime and complete toolchain in one npm package gives users one
dependency to upgrade, but it increases install weight for consumers that use
only the client or server runtime. The package may install Vite, Vitest,
Playwright support, TypeScript, ESLint, Prettier, Tailwind, React tooling,
esbuild, and supporting plugins.

The first implementation should accept that tradeoff while enforcing these
boundaries:

- Runtime exports never import toolchain modules.
- CLI and tool modules load lazily.
- Browser package inspection rejects toolchain code.
- Tool versions remain internal TypeFerry implementation details.
- React, React DOM, MongoDB, and other singleton-sensitive application
  runtimes remain peer or direct application dependencies.
- The package remains tree-shakeable where its runtime exports permit it.

A future physical package split may preserve the same public imports if
install weight becomes unacceptable, but it is not part of this proposal.

## Runtime policy

The current TypeScript package develops on Node `24.19.0`, while the
application template pins Node `26.5.1`. Framework ownership requires one
deliberate policy:

- Support application runtimes `>=24.19.0 <27`.
- Generate or recommend one exact version, initially `26.5.1`.
- Verify the minimum and recommended versions in CI.
- Use the recommended exact Node image for generated containers.
- Keep npm pinned where reproducible package operations require it.

This separates the supported runtime range from the exact reproducible default
given to a new application.

## Public contracts

Likely additions to the package surface are:

```json
{
  "bin": {
    "typeferry": "./dist/cli/index.js"
  },
  "exports": {
    "./config": "...",
    "./test": "...",
    "./eslint": "...",
    "./prettier": "...",
    "./tsconfig": "./dist/presets/tsconfig.json",
    "./tsconfig/client": "./dist/presets/tsconfig.client.json",
    "./tsconfig/server": "./dist/presets/tsconfig.server.json"
  }
}
```

The following become public compatibility boundaries and require deliberate
versioning:

- `defineConfig`, `TypeFerryConfig`, and `ResolvedTypeFerryConfig`.
- CLI command names, arguments, and exit behavior.
- Application directory and test naming conventions.
- Preset exports.
- Build output and metadata structure.
- Container configuration.
- Managed-file markers and ownership rules.

Adding these APIs requires explicit approval before implementation because it
changes the published package surface and establishes a major application
architecture.

## Delivery sequence

Implementation should proceed through vertically complete increments:

1. Add the configuration resolver and `typeferry doctor`.
2. Move development and client/server production builds behind the CLI.
3. Add unit, integration, and browser test projects.
4. Add TypeScript, ESLint, and Prettier commands and presets.
5. Add managed integration files and `typeferry sync`.
6. Add Docker and Compose rendering.
7. Add migration and ejection commands.
8. Reduce the application template to a framework consumer.
9. Verify the workflow from a packed npm artifact.

Each increment should use a procedurally created fixture application. Final
release verification installs the packed `typeferry` artifact into a temporary
application and exercises development startup, builds, split tests, linting,
formatting, type-checking, production startup, container build, and Compose
validation.

## Acceptance criteria

- Existing template development and production behavior remains equivalent.
- Applications no longer own `develop.ts`, `vite.config.ts`, the development
  proxy, or split Vitest configuration files.
- One typed configuration controls framework conventions and supported
  overrides.
- The package CLI owns development, builds, tests, code quality, and container
  workflows.
- Tool upgrades ship through the `typeferry` dependency and lockfile.
- Editor-required adapters contain no duplicated policy.
- Managed files preserve user content and can be verified without mutation.
- Advanced customization has documented stability and ejection semantics.
- Runtime bundles contain no toolchain implementation.
- A packed-package consumer fixture passes the complete application
  verification surface.

## Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| One package becomes heavy to install. | Lazy-load tools and enforce runtime bundle boundaries. |
| Raw tool options become accidental public APIs. | Keep stable intent fields separate from `advanced` escape hatches. |
| Generated files overwrite user work. | Use ownership markers, check mode, and fail on ambiguity. |
| Editors behave differently from the CLI. | Retain minimal discovery adapters and test common editor resolution paths. |
| Container paths resolve relative to `node_modules`. | Render disposable assets and always use the application build context. |
| Minor upgrades materially change behavior. | Version schemas and require explicit migrations for material defaults. |
| Runtime and template Node policies conflict. | Define a supported range plus one tested exact default. |

## Architectural principle

The governing principle is:

> `typeferry.config.ts` describes the application; TypeFerry translates that
> description into Vite, Vitest, TypeScript, ESLint, Prettier, Docker, and
> Compose behavior.

The existing template already forms an implicit framework through its folder
layout, proxy, build orchestration, test divisions, lint boundaries, database
topology, and container lifecycle. Moving those conventions into the package
makes them explicit, typed, testable, versioned, and upgradeable.
