# TypeScript application framework

TypeFerry provides a conventional development, production-build, and test
toolchain through the published `typeferry` package. Applications use the
framework commands without maintaining TypeFerry-specific Vite, Vitest,
esbuild, proxy, or process-orchestration files.

## Install and add scripts

```sh
npm install typeferry
```

Expose the package-owned commands through the application manifest:

```json
{
  "scripts": {
    "develop": "typeferry develop",
    "build": "typeferry build",
    "test": "typeferry test",
    "test:unit": "typeferry test unit",
    "test:integration": "typeferry test integration",
    "test:browser": "typeferry test browser"
  }
}
```

Run commands from the application or any descendant directory. TypeFerry finds
the nearest ancestor `package.json` and treats that directory as the
application root.

## Conventional structure

No TypeFerry configuration file is required when the application follows these
paths:

```text
client/
  index.html          browser entry
common/               browser/server portable contracts
server/
  index.ts            Node.js entry
test/                  optional shared test setup
dist/                  generated output
```

The `@/` alias resolves to the application root. Keep portable code in
`common/`; browser code must not import Node-only `server/` modules. The build
fails when `client/index.html` or `server/index.ts` is missing. TypeFerry owns
`dist/`; `typeferry build` removes it before writing a new build.

## Develop

```sh
npm run develop
```

`typeferry develop`:

- serves the React client through Vite on port `8000` by default;
- builds and watches the Node server;
- starts the bundled server with Node's watch mode and `.env.server`;
- proxies TypeFerry HTTP traffic from the client server to server port `8002`;
- resolves React from the application to preserve a single runtime instance;
- writes tagged process output to the terminal and `dev.log`; and
- shuts down the client server, compiler, and backend process together.

Forward application-specific arguments to `server/index.ts` after `--`:

```sh
typeferry develop -- --seed
```

Arguments placed before `--` are rejected.

## Build

```sh
npm run build
```

The client and server build concurrently and produce:

```text
dist/
  client/              production client assets and Vite manifest
  server/
    index.cjs           bundled Node.js entry
    index.cjs.map       source map when enabled
```

The stable production artifacts are `dist/client/` and
`dist/server/index.cjs`.

Production startup remains application-owned. A typical manifest uses:

```json
{
  "scripts": {
    "start": "node dist/server/index.cjs"
  }
}
```

The framework does not own the production environment, process supervisor,
Dockerfile, Compose services, TLS proxy, database, or secret injection. See
[deployment](deployment.md) for operational requirements.

### External server packages

The server bundle includes runtime dependencies by default. Keep a package
external when it cannot be bundled safely—for example, because it contains a
native Node.js addon or loads assets relative to its installed package:

```ts
import { defineConfig } from 'typeferry/config'

export default defineConfig({
  build: {
    server: {
      external: ['sharp', 'mongodb', '@scope/runtime/subpath'],
    },
  },
})
```

Every external must be a bare npm package specifier. Scoped packages and
package subpaths are supported; relative paths, absolute paths, Node built-ins,
URLs, and wildcard patterns are not. TypeFerry verifies that the owning package
is a direct entry in the application's `dependencies`. A package available only
through `devDependencies` or transitive hoisting is rejected because it may not
survive a production-only install.

The configured list applies to the watched development server and the
production server build. TypeFerry leaves each matching import in the generated
server artifact; it does not install or copy the package. Production images and
other deployment environments must ship the lockfile-derived runtime graph. A
multi-stage npm image can run `npm prune --omit=dev` after building and copy the
resulting `node_modules`, `package.json`, and lockfile into its runtime stage.

## Test

Run every project or select one environment:

```sh
typeferry test
typeferry test unit
typeferry test integration
typeferry test browser
typeferry test unit --watch
```

| Project     | Discovery pattern          | Runtime behavior                                               |
| ----------- | -------------------------- | -------------------------------------------------------------- |
| Unit        | `*.unit.spec.ts(x)`        | Pure and non-DOM tests                                         |
| Integration | `*.integration.spec.ts(x)` | Serial execution, decorator transform, configurable timeout    |
| Browser     | `*.browser.spec.ts(x)`     | Headless Playwright browser with React and Tailwind transforms |

Discovery covers `client/`, `common/`, `server/`, and `test/`. Add optional
application setup in:

- `test/setup-unit.ts`
- `test/setup-integration.ts`
- `test/setup-browser.ts`

Import the test API through TypeFerry instead of depending on a hoisted
transitive Vitest installation:

```ts
import { describe, expect, it, vi } from 'typeferry/test'
```

`typeferry/test` mirrors the Vitest version installed by TypeFerry. Those
individual exports follow Vitest and do not receive an independent TypeFerry
compatibility guarantee. Browser tests also expose Vitest globals; use the
global `vi` when browser transformation cannot mock through the re-export.

Testing Library and other libraries imported directly by application tests
remain application dependencies.

## Optional configuration

Create `typeferry.config.ts` only when a supported default must change:

```ts
import { defineConfig } from 'typeferry/config'

export default defineConfig({
  development: {
    clientPort: 8000,
    serverPort: 8002,
    serverEnvironmentFile: '.env.server',
  },
  build: {
    target: 'es2023',
    sourceMaps: true,
    server: {
      external: [],
    },
  },
  test: {
    integration: {
      timeout: 30_000,
    },
    browser: {
      browser: 'chromium',
    },
  },
})
```

Supported browser values are `chromium`, `firefox`, and `webkit`. Configuration
validation rejects unknown fields, invalid ports, empty strings, and
non-positive timeouts. Server external lists additionally reject duplicates and
non-package specifiers. The `DEVELOP_ENV_FILE` environment variable overrides
the default development environment file only when the configuration does not
set `serverEnvironmentFile`.

The configuration intentionally exposes high-level TypeFerry concepts rather
than raw Vite, Vitest, or esbuild objects. If a required customization is not
represented by the public type, it is not currently supported by the
package-owned commands.

## Migrate an existing application

1. Install a TypeFerry version that provides the application CLI.
2. Make sure the application has `client/index.html` and `server/index.ts`.
3. Replace direct development, Vite build, esbuild, and Vitest scripts with the
   package-owned commands.
4. Rename tests to the unit, integration, or browser discovery conventions.
5. Move shared setup into the optional `test/setup-*.ts` files.
6. Import runner APIs from `typeferry/test`.
7. Remove obsolete `vite.config.*`, `vitest.config.*`, and custom development
   orchestration only after their behavior is represented by TypeFerry.
8. Retain application-owned TypeScript, lint, formatting, environment,
   production-container, and infrastructure configuration.
9. Run all test projects and a production build before deleting the old path.

Do not silently discard application-specific plugins or build behavior. If the
typed configuration cannot represent a requirement, keep the existing tooling
until TypeFerry supports it or choose not to adopt the package-owned command for
that workflow.

## Upgrade

```sh
npm install typeferry@latest
npm run typecheck
npm test
npm run build
```

Review the package changelog before upgrading. TypeFerry updates its internal
toolchain through the package, while applications continue to own dependencies
they import directly.

## Troubleshooting

- **No application root:** run inside a directory beneath the intended
  `package.json`.
- **Missing client or server entry:** add `client/index.html` and
  `server/index.ts` at the application root.
- **Development environment does not load:** create `.env.server`, configure
  `serverEnvironmentFile`, or set `DEVELOP_ENV_FILE`.
- **A test is not discovered:** use the correct suffix and place it beneath
  `client/`, `common/`, `server/`, or `test/`.
- **Browser test dependency is missing:** install every library imported by the
  test directly; TypeFerry supplies the runner and browser provider, not the
  complete application test stack.
- **Raw Vite or Vitest options are needed:** the high-level configuration does
  not accept them. Preserve the existing application-owned workflow and raise
  the missing use case rather than relying on internals.

The [application template](../../template/README.md) is the canonical runnable
example. The [toolchain architecture](../architecture/application-framework-toolchain.md)
explains ownership and implementation boundaries in greater depth.
