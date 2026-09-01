# TypeFerry Documentation

Use this page to choose the smallest guide that matches what you are building. [`PROTOCOL.md`](../PROTOCOL.md) is the normative source for wire behavior; these guides explain application development against the current implementations.

> [!NOTE]
> Registry packages are not published yet. Begin with the repository-local [quickstart](getting-started.md) and consult [`RELEASING.md`](../RELEASING.md) for current publication status.

## Start here

- [Run the full TypeScript application template](getting-started.md)
- [Understand the protocol](../PROTOCOL.md)
- [Compare implementation architecture](architecture/overview.md)

## TypeScript

| Goal | Guide |
|---|---|
| Understand the package and local setup | [`typeferry-ts/README.md`](../typeferry-ts/README.md) |
| Create a server and RPC methods | [Server and RPC](typescript/server-rpc.md) |
| Use the browser or Node client | [Client](typescript/client.md) |
| Bind TypeFerry to React | [React](typescript/react.md) |
| Bind TypeFerry to Lit | [Lit](typescript/lit.md) |
| Add authentication and sessions | [Authentication](typescript/authentication.md) |
| Publish and consume events | [Events and channels](typescript/events-and-channels.md) |
| Use typed MongoDB collections and live invalidation | [MongoDB](typescript/mongodb.md) |
| Serialize extended values | [EJSON](typescript/ejson.md) |
| Build and deploy a Node.js application | [Deployment](typescript/deployment.md) |

## Python

The Python implementation is a server library with EJSON, protocol messages, methods, decorators, HTTP/WebSocket/Redis transports, auth, and conformance support. It does not provide a browser client.

- [Python server development](../typeferry-py/README.md)
- [Python runtime architecture](architecture/python-runtime.md)

## Rust

The Rust implementation is a modular server workspace with optional HTTP, WebSocket, Redis, auth, and macro features. It does not provide a browser client.

- [Rust server development](../typeferry-rs/README.md)
- [Rust runtime architecture](architecture/rust-runtime.md)

## Protocol and conformance

- [Wire protocol](../PROTOCOL.md)
- [Shared conformance fixtures](conformance/README.md)
- [Protocol change runbook](runbooks/protocol-changes.md)
- [Conformance failure diagnosis](runbooks/diagnose-conformance-failure.md)

## Contributor and maintainer documentation

- [Agent/contributor task router](agents/README.md)
- [Architecture overview](architecture/overview.md)
- [Release verification](runbooks/release-verification.md)
- [Dependency updates](runbooks/update-dependency.md)
- [Current release status](../RELEASING.md)

Documents under `plans/` are historical and non-normative. Accepted decisions live under [`decisions/`](../decisions/), and task specifications live under [`specs/`](../specs/).
