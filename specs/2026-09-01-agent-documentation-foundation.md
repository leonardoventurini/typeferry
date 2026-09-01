# Agent Documentation Foundation Specification

## Problem

TypeFerry has strong protocol, conformance, release, plan, and decision records, but coding-agent guidance is concentrated in the root `AGENTS.md`. Package-specific constraints are mixed with repository-wide rules, recurring workflows are not documented as executable runbooks, and completed plans are not explicitly distinguished from current normative documentation.

## Evidence

- The repository has a root `AGENTS.md` and a template-specific `template/AGENTS.md`, but no package-level instruction files for the TypeScript, Python, or Rust implementations.
- `docs/` contains conformance material and historical plans, but no agent router, stable architecture section, or operational runbooks.
- The root instruction file contains detailed TypeScript runtime and testing knowledge that applies only under `typeferry-ts/`.
- Existing plans describe historical implementation work without a consistent non-normative banner.
- Official OpenAI guidance favors lean instructions, stating each instruction once, and concrete validation commands for coding agents.

## Desired Outcome

Create a durable agent-documentation foundation consisting of a concise root router, scoped package instruction files, an agent task index, stable architecture pages, and executable runbooks for protocol changes, conformance diagnosis, dependency updates, and release verification. Clearly label every existing plan as historical and non-normative.

## Scope and Assumptions

- Create `typeferry-ts/AGENTS.md`, `typeferry-py/AGENTS.md`, and `typeferry-rs/AGENTS.md`.
- Create `docs/agents/README.md`.
- Create `docs/architecture/overview.md` plus one architecture page for each implementation.
- Create four runbooks under `docs/runbooks/`.
- Refactor the root `AGENTS.md` into repository-wide governance and routing instructions.
- Preserve `template/AGENTS.md` as the standalone template's scoped contract.
- Add historical/non-normative banners to all current files under `docs/plans/`.
- Do not change runtime code, public APIs, dependencies, wire behavior, or release policy.

## Authority Contracts

- `PROTOCOL.md` remains normative for cross-language wire behavior.
- `docs/conformance/README.md` and its fixtures remain normative executable examples of the protocol.
- `AGENTS.md` files define operational instructions within their directory scopes.
- `docs/architecture/` describes the current implementation and is informative, not a substitute for source and tests.
- `docs/runbooks/` defines repeatable procedures but cannot override protocol or scoped agent instructions.
- `specs/`, `decisions/`, and `docs/plans/` retain their existing roles; completed plans are historical evidence, not current instructions.

## Risks and Recovery

- Duplicated guidance can drift. State each rule in its narrowest authoritative location and link instead of copying details.
- Incorrect commands can waste agent time. Derive commands from package manifests and configuration, and validate their referenced scripts or tools.
- Nested instructions can contradict root guidance. Review the effective hierarchy from repository root into each package.
- Architecture prose can become stale. Prefer stable ownership boundaries and source paths over volatile implementation counts.
- Recovery is a normal revert of the documentation commit; no runtime or persisted state changes are involved.

## Test Strategy and Acceptance Criteria

This task is documentation-only, so runtime tests are not required.

- [ ] Every new Markdown link resolves to a tracked file or documented external source.
- [ ] Every referenced repository path exists.
- [ ] Every documented npm script exists in the applicable `package.json`.
- [ ] TypeScript commands use exact Node.js `24.19.0`, npm `11.17.0`, and `typeferry-ts/` as the working directory.
- [ ] Python and Rust commands use their package directories and current configured test/type/lint tools.
- [ ] The root and nested `AGENTS.md` files contain no contradictory instructions or unnecessary duplication.
- [ ] The agent router covers the four implementation areas and four requested recurring workflows.
- [ ] Architecture pages identify authority, ownership boundaries, extension points, and verification surfaces.
- [ ] Runbooks contain preconditions, ordered actions, acceptance criteria, and recovery guidance.
- [ ] Every existing `docs/plans/*.md` file has a historical/non-normative banner.
- [ ] `git diff --check` and the documentation integrity checks pass.
- [ ] All task-owned changes are committed semantically and the worktree is clean.

## Executable Checklist

1. Commit this specification.
2. Refactor root guidance and add scoped package instruction files.
3. Add the agent router, architecture pages, and runbooks.
4. Add plan-status banners.
5. Run read-only documentation integrity checks for local links, paths, scripts, hierarchy coverage, and banners.
6. Run Markdown whitespace validation.
7. Commit the documentation foundation as one coherent unit.

## Direct Rollout

Merge the documentation commit directly. New agent sessions will consume the scoped instruction hierarchy immediately; no runtime deployment or data migration is required.

## Verification Reporting

Report which structural checks were executed, which commands were validated by configuration inspection rather than run, any external documentation citation used, and the recommended review order from root routing through scoped instructions, architecture, runbooks, and historical plan labels.
