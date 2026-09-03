# TypeFerry

TypeFerry is a type-safe, real-time RPC framework with HTTP and WebSocket transports, server events and channels, authentication primitives, EJSON serialization, and shared conformance across TypeScript, Python, and Rust.

The TypeScript implementation includes browser clients plus a React integration. Python and Rust provide server-side implementations of the same wire protocol.

> [!IMPORTANT]
> The TypeScript package is published on npm as `typeferry`. Python and Rust publication remains disabled. See [release status](RELEASING.md).

## Implementations

| Implementation | Server | Browser client | UI adapters | Status and entry point |
|---|---:|---:|---|---|
| [TypeScript](typeferry-ts/README.md) | Yes, Node.js | Yes | React | Reference implementation |
| [Python](typeferry-py/README.md) | Yes | No | — | Server-side protocol parity |
| [Rust](typeferry-rs/README.md) | Yes | No | — | Modular server-side protocol parity |

All implementations share the normative [wire protocol](PROTOCOL.md) and [conformance fixtures](docs/conformance/README.md).

## Install the TypeScript package

```sh
npm install typeferry
```

Applications import focused exports such as `typeferry/client`, `typeferry/server`, and `typeferry/react`.

## Develop, build, and test applications

TypeFerry includes a batteries-included application workflow for the
conventional root-level `client/`, `common/`, `server/`, and `test/`
directories. No `typeferry.config.ts`, Vite configuration, or Vitest
configuration is required for the defaults:

```json
{
  "scripts": {
    "develop": "typeferry develop",
    "build": "typeferry build",
    "test": "typeferry test"
  }
}
```

Use `typeferry test unit`, `integration`, or `browser` for a single test
project. Add an optional typed `typeferry.config.ts` only for supported
high-level overrides. Read the [application framework guide](docs/typescript/application-framework.md)
for commands, conventions, configuration, migration, and troubleshooting.

## Define RPC methods with decorators

Define a namespace as a class, expose its methods with decorators, and derive the client API type directly from the implementation:

```ts
import type { ClientNode } from 'typeferry/server'
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

registerNamespace(GreetingMethods)
```

The method is available as `greeting.hello` over HTTP and WebSocket, with runtime input validation and an inferred typed client call. See the [server and RPC guide](docs/typescript/server-rpc.md) for middleware, authentication, caching, and server setup.

## What TypeFerry provides

- Typed RPC methods with middleware, schema validation, protection, and caching.
- HTTP calls and persistent WebSocket connections using the same method model.
- Server-to-client events, named channels, rooms, and optional Redis propagation.
- Authentication hooks, JWT/session helpers, cookies, and OAuth building blocks.
- EJSON support for dates, binary data, regular expressions, non-finite numbers, and custom types.
- React hooks over the same framework-agnostic TypeScript client.
- An optional TypeScript MongoDB extension for typed collections and live invalidation.
- Cross-language fixtures and interoperability tests.

## Run the local application

The fastest development path is the template, which installs the published
`typeferry` package from npm.

Prerequisites:

- Mise
- Docker
- The toolchain pinned by [`template/.mise.toml`](template/.mise.toml)

```sh
git clone https://github.com/leonardoventurini/typeferry.git
cd typeferry/template
mise install
mise exec -- npm ci
cp .env.server.example .env.server
docker compose up -d mongodb
mise exec -- npm run develop
```

The template includes a Node.js server, WebSocket client, React UI, MongoDB replica set, migrations, typed RPC methods, authentication seam, and production build. Follow the [quickstart](docs/getting-started.md) for setup and verification.

## Documentation

- [AI agent application guide](docs/agents/application-development.md)
- [LLM documentation index](llms.txt)
- [Documentation home](docs/README.md)
- [Quickstart](docs/getting-started.md)
- [TypeScript application framework](docs/typescript/application-framework.md)
- [TypeScript server and RPC](docs/typescript/server-rpc.md)
- [TypeScript client](docs/typescript/client.md)
- [React integration](docs/typescript/react.md)
- [Authentication](docs/typescript/authentication.md)
- [Events and channels](docs/typescript/events-and-channels.md)
- [MongoDB extension](docs/typescript/mongodb.md)
- [EJSON](docs/typescript/ejson.md)
- [Deployment](docs/typescript/deployment.md)
- [Python server development](typeferry-py/README.md)
- [Rust server development](typeferry-rs/README.md)

## Repository layout

```text
typeferry-ts/   TypeScript client and Node.js server
typeferry-py/   Python server implementation
typeferry-rs/   Rust server workspace
template/       Repository-local React + MongoDB application
docs/           End-user, protocol, conformance, and contributor docs
PROTOCOL.md     Normative wire protocol
```

## Contributing

Start with [the agent and contributor router](docs/agents/README.md), then read the nearest `AGENTS.md` for the package you are changing. Protocol-visible changes must update `PROTOCOL.md`, affected implementations, and shared fixtures together.

TypeFerry is licensed under the [MIT License](LICENSE).
