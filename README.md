# TypeFerry

TypeFerry is a type-safe, real-time RPC framework with HTTP and WebSocket transports, server events and channels, authentication primitives, EJSON serialization, and shared conformance across TypeScript, Python, and Rust.

The TypeScript implementation includes browser clients plus React and Lit integrations. Python and Rust provide server-side implementations of the same wire protocol.

> [!IMPORTANT]
> TypeFerry is public source but its npm, PyPI, and crates.io packages are not published yet. Package names and release automation remain intentionally disabled. Use the repository-local workflows below and see [release status](RELEASING.md).

## Implementations

| Implementation | Server | Browser client | UI adapters | Status and entry point |
|---|---:|---:|---|---|
| [TypeScript](typeferry-ts/README.md) | Yes, Node.js | Yes | React and Lit | Reference implementation |
| [Python](typeferry-py/README.md) | Yes | No | — | Server-side protocol parity |
| [Rust](typeferry-rs/README.md) | Yes | No | — | Modular server-side protocol parity |

All implementations share the normative [wire protocol](PROTOCOL.md) and [conformance fixtures](docs/conformance/README.md).

## What TypeFerry provides

- Typed RPC methods with middleware, schema validation, protection, and caching.
- HTTP calls and persistent WebSocket connections using the same method model.
- Server-to-client events, named channels, rooms, and optional Redis propagation.
- Authentication hooks, JWT/session helpers, cookies, and OAuth building blocks.
- EJSON support for dates, binary data, regular expressions, non-finite numbers, and custom types.
- React hooks and Lit reactive controllers over the same TypeScript client.
- An optional TypeScript MongoDB extension for typed collections and live invalidation.
- Cross-language fixtures and interoperability tests.

## Run the local application

The fastest supported development path is the repository template, which consumes `typeferry-ts` through a local `file:` dependency.

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

- [Documentation home](docs/README.md)
- [Quickstart](docs/getting-started.md)
- [TypeScript server and RPC](docs/typescript/server-rpc.md)
- [TypeScript client](docs/typescript/client.md)
- [React integration](docs/typescript/react.md)
- [Lit integration](docs/typescript/lit.md)
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
