<p align="center">
  <img
    src="docs/assets/typeferry-banner.webp"
    alt="TypeFerry carries typed real-time data from a server across a bridge to web, component, and mobile clients"
  >
</p>

# TypeFerry

Build type-safe, real-time TypeScript applications from one server contract.

TypeFerry connects a Node.js server to browser, Node.js, React, and optional
Capacitor iOS clients through typed RPC, HTTP and WebSocket transports,
authenticated events, and live data. It also owns the application workflow:
develop, test, build, and run the complete stack without maintaining separate
Vite or Vitest configurations.

The same wire protocol has server implementations in Python and Rust when a
service needs to cross language boundaries.

```sh
npm install typeferry
```

## Why TypeFerry

- **One contract from server to client.** Infer the client API directly from
  decorated server methods, with runtime input validation and no generated
  client artifacts.
- **RPC and real-time behavior belong together.** Call the same method over
  HTTP or WebSocket, then use events, private channels, rooms, or live MongoDB
  publications to keep clients current.
- **React is an adapter, not a separate runtime.** Hooks expose method state,
  authentication, connection and reconnection state, subscriptions,
  event-driven refresh, and live publications over the core TypeScript client.
- **The application toolchain is included.** TypeFerry supplies development,
  client and server builds, split unit/integration/browser testing, and an
  optional typed configuration surface.
- **Web and iOS share the application model.** Build the React client for the
  web or package it with Capacitor for iOS, with native authentication, private
  cookie HTTP, lifecycle, file sharing, media permissions, and simulator tools.
- **Production boundaries stay explicit.** Authentication and authorization
  policy remain application-owned; the MongoDB extension preserves the native
  driver instead of replacing it with an ORM.

## From a server method to a typed client call

Define a namespace, validate its network input with Zod, and infer the client
contract from the implementation:

```ts
// server/greeting.ts
import { Server, type ClientNode } from 'typeferry/server'
import {
  type InferNamespace,
  Method,
  Namespace,
  registerNamespace,
  Schema,
} from 'typeferry/server/decorators'
import { z } from 'zod'

const greetingSchema = z.object({
  name: z.string().trim().min(1),
})

type GreetingInput = z.infer<typeof greetingSchema>

@Namespace('greeting')
export class GreetingMethods {
  @Method()
  @Schema(greetingSchema)
  async hello(
    _client: ClientNode,
    input: GreetingInput,
  ): Promise<string> {
    return `Hello, ${input.name}!`
  }
}

export type GreetingApi = InferNamespace<GreetingMethods, 'greeting'>

const server = new Server({ host: '127.0.0.1', port: 8002 })

registerNamespace(GreetingMethods)
await server.isReady()
```

Parameterize the client with that exported type. The method path, input, and
result are now checked by TypeScript:

```ts
// client/greeting.ts
import { Client } from 'typeferry/client'
import type { GreetingApi } from '../server/greeting'

const client = new Client<GreetingApi>({
  host: '127.0.0.1',
  port: 8002,
})

const greeting = await client.m.greeting.hello({ name: 'Ada' })
//    ^? string
```

Decorators can also attach middleware, authentication requirements, caching,
and schemas to a namespace or method; application code retains authorization
decisions. Read the [server and RPC guide](docs/typescript/server-rpc.md) and
[client guide](docs/typescript/client.md) for the complete lifecycle.

## One framework from transport to UI

```text
Decorated Node.js methods
          │
          ├── HTTP RPC ───────────────┐
          ├── WebSocket RPC           │
          └── events and channels     │
                                      ▼
                         Typed TypeScript client
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 React state hooks       framework-agnostic code
                         │
                         ▼
              browser or Capacitor iOS

MongoDB change streams ──► authorized live publications ──► React/client state
```

### Server and transport

- Namespaced RPC methods with Zod validation, middleware, protection, caching,
  rate limiting, and structured errors.
- HTTP and persistent WebSocket transports backed by one Node.js server.
- Server-to-client events, named channels, rooms, origin exclusion, and
  optional Redis propagation across server processes.
- EJSON serialization for dates, binary data, regular expressions,
  non-finite numbers, and application-defined types.

### Client and React

- A framework-independent TypeScript client for browsers and Node.js.
- Automatic connection lifecycle, retry and HTTP fallback controls, context,
  authentication state, logging, and channel subscriptions.
- React hooks for RPC state, lazy calls, debouncing, cache controls,
  event-driven refresh, subscriptions, reconnection state, and token refresh.

### Authentication and data

- JWT, sessions, secure-cookie helpers, token refresh, cross-tab synchronization,
  device metadata, and Google OAuth building blocks.
- A native-driver-first MongoDB extension with typed collections, indexes,
  Zod-to-BSON schema enforcement, timestamps, and change-stream events.
- Authorized live MongoDB publications that deliver an initial snapshot and
  apply added, changed, and removed operations over WebSocket, including
  bounded ordered windows and automatic resynchronization.

## Develop, test, and build an application

Applications can use conventional root-level `client/`, `common/`, `server/`,
and `test/` directories with no TypeFerry, Vite, or Vitest configuration:

```json
{
  "scripts": {
    "develop": "typeferry develop",
    "build": "typeferry build",
    "test": "typeferry test"
  }
}
```

- `typeferry develop` runs the Vite client and watched Node.js server with the
  development proxy configured for RPC traffic.
- `typeferry test unit`, `integration`, or `browser` selects the corresponding
  Vitest project; browser tests run through Playwright.
- `typeferry build` produces the Vite client and a bundled Node.js server for
  deployment.
- An optional typed `typeferry.config.ts` exposes supported ports, proxy routes,
  test configuration, build extensions, server externals, and application
  targets without handing ownership of the toolchain back to the application.

See the [application framework guide](docs/typescript/application-framework.md)
for conventions, configuration, migration, deployment boundaries, and
troubleshooting.

## Take the same client to iOS

The optional iOS target bundles an existing React client with Capacitor.
Ordinary web applications do not import Capacitor or pay for the native path.

```sh
npm exec -- typeferry build --target ios
npm exec -- typeferry native add ios
npm exec -- typeferry native doctor ios
npm exec -- typeferry native run ios
```

TypeFerry can generate and safely synchronize the conventional native bridge,
inspect available simulators, diagnose the local toolchain, build and launch an
app, stream its logs, and capture screenshots. Product identity, signing,
entitlements, native assets, physical-device testing, and distribution remain
application-owned. Read the [iOS application guide](docs/typescript/ios-applications.md)
and [native authentication guide](docs/typescript/native-authentication.md).

## Run the reference application

The repository includes a React, Node.js, and MongoDB application that shows a
protected mutation, an acknowledged database write, a private real-time event,
and authoritative UI refresh.

Prerequisites are Git, [Mise](https://mise.jdx.dev/), and Docker with Compose:

```sh
git clone https://github.com/leonardoventurini/typeferry.git
cd typeferry/template
mise install
mise exec -- npm ci
cp .env.server.example .env.server
docker compose up -d mongodb
mise exec -- npm run develop
```

Follow the [quickstart](docs/getting-started.md) to trace the request from React
through the typed server method, MongoDB, and the real-time invalidation path.

## One protocol, multiple server runtimes

TypeScript is the reference and only currently published package. Python and
Rust implement the same normative wire protocol for server-side interoperability.

| Implementation | Server | Client | UI adapter | Status |
|---|---:|---:|---|---|
| [TypeScript](typeferry-ts/README.md) | Node.js | Browser and Node.js | React | Published as `typeferry` |
| [Python](typeferry-py/README.md) | Yes | — | — | Publication disabled |
| [Rust](typeferry-rs/README.md) | Yes | — | — | Publication disabled |

All implementations share the normative [wire protocol](PROTOCOL.md),
[conformance fixtures](docs/conformance/README.md), and interoperability tests.
See [release status](RELEASING.md) for current publication details.

## Documentation

- [Quickstart](docs/getting-started.md)
- [TypeScript application framework](docs/typescript/application-framework.md)
- [Server and RPC](docs/typescript/server-rpc.md)
- [Client](docs/typescript/client.md)
- [React integration](docs/typescript/react.md)
- [Authentication](docs/typescript/authentication.md)
- [Events and channels](docs/typescript/events-and-channels.md)
- [MongoDB extension](docs/typescript/mongodb.md)
- [EJSON](docs/typescript/ejson.md)
- [Minimongo](docs/typescript/minimongo.md)
- [iOS applications](docs/typescript/ios-applications.md)
- [Native authentication](docs/typescript/native-authentication.md)
- [Deployment](docs/typescript/deployment.md)
- [Documentation home](docs/README.md)
- [AI agent application guide](docs/agents/application-development.md)
- [LLM documentation index](llms.txt)

## Repository layout

```text
typeferry-ts/   TypeScript application framework, client, and Node.js server
typeferry-py/   Python server implementation
typeferry-rs/   Rust server workspace
template/       React, Node.js, and MongoDB reference application
docs/           User guides, architecture, protocol, and conformance docs
PROTOCOL.md     Normative wire protocol
```

## Contributing

Start with [the agent and contributor router](docs/agents/README.md), then read
the nearest `AGENTS.md` for the package you are changing. Protocol-visible
changes must update `PROTOCOL.md`, affected implementations, and shared fixtures
together.

TypeFerry is licensed under the [MIT License](LICENSE).
