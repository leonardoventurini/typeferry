# Agent Documentation

This index routes coding tasks to the smallest sufficient context. Read the repository root `AGENTS.md` first, then the nearest scoped `AGENTS.md`. Do not load every linked document unless the task crosses those boundaries.

## Authority order

1. Direct user requirements and accepted task scope.
2. [`PROTOCOL.md`](../../PROTOCOL.md) for normative wire behavior.
3. The nearest applicable `AGENTS.md` for repository operations.
4. Accepted records under [`decisions/`](../../decisions/) for durable rationale.
5. Current source and tests for implementation truth.
6. Architecture pages and runbooks for navigation and procedure.
7. Specifications for approved task contracts.
8. Historical plans for background only.

When two sources at the same level disagree, stop and surface the conflict instead of choosing silently.

## Task router

| Task | Read first | Primary verification |
|---|---|---|
| Understand the repository | [Architecture overview](../architecture/overview.md) | Confirm referenced paths in the current tree |
| Change TypeScript runtime or clients | [`typeferry-ts/AGENTS.md`](../../typeferry-ts/AGENTS.md), [TypeScript architecture](../architecture/typescript-runtime.md) | Split npm suites, typecheck, lint, build |
| Change Python server parity | [`typeferry-py/AGENTS.md`](../../typeferry-py/AGENTS.md), [Python architecture](../architecture/python-runtime.md) | pytest, Ruff, mypy |
| Change Rust server parity | [`typeferry-rs/AGENTS.md`](../../typeferry-rs/AGENTS.md), [Rust architecture](../architecture/rust-runtime.md) | fmt, Clippy, workspace tests |
| Change the application template | [`template/AGENTS.md`](../../template/AGENTS.md) | Template split suites and builds |
| Change wire or shared behavior | [Protocol-change runbook](../runbooks/protocol-changes.md) | Shared fixtures and affected language suites |
| Diagnose conformance failure | [Conformance diagnosis runbook](../runbooks/diagnose-conformance-failure.md) | Reproduce one fixture, then expand |
| Update a dependency | [Dependency-update runbook](../runbooks/update-dependency.md) | Lockfile integrity, audit, affected suites |
| Verify release readiness | [Release-verification runbook](../runbooks/release-verification.md), [`RELEASING.md`](../../RELEASING.md) | Build and package inspection |
| Change auth defaults | [`PROTOCOL.md`](../../PROTOCOL.md), protocol runbook, relevant architecture page | Auth unit/integration and cross-language fixtures |
| Change shared fixtures | [Conformance documentation](../conformance/README.md), protocol runbook | All implementations consuming the fixture |

## Document roles

- `AGENTS.md`: concise operational constraints automatically scoped by directory.
- `docs/architecture/`: informative current-system maps; update them when ownership or dependency direction changes.
- `docs/runbooks/`: repeatable procedures with acceptance and recovery steps.
- `PROTOCOL.md` and `docs/conformance/`: normative cross-language contract and executable examples.
- `specs/`: problem, scope, risks, and acceptance criteria for planned work.
- `decisions/`: durable rationale and consequences after architectural or workflow choices.
- `docs/plans/`: historical implementation records; never treat unchecked steps as current instructions.

## Documentation quality contract

- Prefer stable paths, symbols, commands, invariants, and observable outcomes over narrative advice.
- State each instruction once and link to its authority elsewhere.
- Label examples as examples and requirements as requirements.
- Record command working directories and prerequisites.
- Avoid volatile counts and generated output unless an automated check owns them.
- Update links whenever referenced files or exports move.
