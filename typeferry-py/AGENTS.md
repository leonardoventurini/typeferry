# Python Package Agent Instructions

These instructions apply under `typeferry-py/` and extend the repository root instructions.

## Scope and architecture

- This package implements server-side parity with the TypeScript reference behavior; it does not implement the TypeScript browser clients or framework adapters.
- `src/typeferry/ejson/` owns serialization, `protocol/` owns wire shapes and constants, `server/` owns runtime primitives, and `server/transports/` owns HTTP and WebSocket behavior.
- `src/typeferry/auth/` owns JWT, sessions, cookies, device information, and OAuth integration.
- `src/typeferry/decorators/` is an authoring layer over the runtime. Keep decorators thin and preserve direct runtime APIs.
- Optional transports and integrations must remain behind the extras defined in `pyproject.toml`; do not make the core protocol/EJSON layer import them eagerly.

Read [docs/architecture/python-runtime.md](../docs/architecture/python-runtime.md) before moving responsibilities between modules.

## Types and dependencies

- Keep mypy strict. Add precise annotations at public and async boundaries; do not silence errors broadly or replace known types with `Any`.
- Preserve optional-dependency boundaries and the current minimum Python version in `pyproject.toml`.
- Use environment-independent paths to shared fixtures; never duplicate conformance cases inside the package.
- Keep application-owned WebSocket handshake authentication fail-closed and higher precedence than query-token authentication.

## Tests and verification

- Unit tests live under `tests/unit/`; shared fixture tests live under `tests/conformance/`.
- Run commands from `typeferry-py/`:

```sh
python -m pytest
ruff check .
mypy
```

- For a focused change, run the affected test module first, then the full commands above.
- Changes to EJSON, HTTP, WebSocket, auth defaults, or message shapes also require the shared protocol-change runbook.
