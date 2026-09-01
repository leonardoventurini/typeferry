# Python Runtime Architecture

Status: informative. Follow [`typeferry-py/AGENTS.md`](../../typeferry-py/AGENTS.md) for operational requirements.

## Ownership map

| Area | Primary path | Responsibility |
|---|---|---|
| EJSON | `typeferry-py/src/typeferry/ejson/` | Presentation conversion and canonical serialization behavior |
| Protocol | `typeferry-py/src/typeferry/protocol/` | Message shapes, constants, and protocol types |
| Runtime | `typeferry-py/src/typeferry/server/` | Methods, middleware, context, events, rooms, and clients |
| Transports | `typeferry-py/src/typeferry/server/transports/` | HTTP, WebSocket, and Redis-facing behavior |
| Auth | `typeferry-py/src/typeferry/auth/` | JWT, cookies, sessions, device information, and OAuth |
| Decorators | `typeferry-py/src/typeferry/decorators/` | Typed authoring ergonomics over runtime registration |
| Unit tests | `typeferry-py/tests/unit/` | Local runtime and integration-boundary behavior |
| Conformance tests | `typeferry-py/tests/conformance/` | Shared fixture execution |

## Layering

The core EJSON and protocol layers depend only on the Python standard library. HTTP, WebSocket, Redis, auth, and schema integrations are optional extras declared in `pyproject.toml`. Core imports must not require users to install every integration.

The runtime owns behavior; decorators translate declarations into runtime registrations. Transport adapters map host-framework requests and connections onto runtime primitives without changing protocol semantics.

## Authentication boundary

Application-owned WebSocket handshake authentication may inspect protected handshake metadata. When configured, its result takes precedence over query-token authentication and must fail closed on rejection, error, or timeout. Cookie, JWT, session, and OAuth defaults remain protocol-governed.

## Verification boundary

Use focused pytest modules for local behavior, `tests/conformance/` for shared fixtures, Ruff for static style and correctness checks, and strict mypy for type boundaries. Cross-language behavior is also exercised from the TypeScript integration harness.
