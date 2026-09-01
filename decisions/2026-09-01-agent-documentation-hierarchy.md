# Agent Documentation Hierarchy

## Context

TypeFerry's repository-wide and TypeScript-specific agent guidance previously lived together in one root `AGENTS.md`. The protocol, conformance, release, plan, specification, and decision documents had distinct purposes, but no task router explained their authority or prevented historical plans from being treated as current instructions.

OpenAI's [Codex agent-instruction guidance](https://developers.openai.com/codex/guides/agents-md/) supports repository and nested instruction files. Current model guidance also favors lean prompts, stating instructions once, and naming concrete validation commands.

## Decision

- Keep the root `AGENTS.md` as a concise repository map, cross-language contract, and task router.
- Put TypeScript, Python, Rust, and template-specific instructions in the nearest package `AGENTS.md`.
- Use `docs/agents/README.md` as the human- and agent-readable index of authority and task context.
- Use `docs/architecture/` for stable current-system ownership and dependency maps.
- Use `docs/runbooks/` for repeatable procedures with preconditions, exact working directories, acceptance criteria, and recovery.
- Keep `PROTOCOL.md` and shared conformance fixtures normative for wire behavior.
- Mark every document under `docs/plans/` as historical and non-normative.
- State each durable instruction at the narrowest applicable scope and link to it instead of copying it.

## Rejected alternatives

- **One comprehensive root instruction file:** rejected because package-specific details consume context for unrelated tasks and are more likely to drift.
- **Agent router without nested instructions:** rejected because commands and constraints should be automatically scoped to the files an agent is editing.
- **Move historical plans into an archive:** rejected because moving files would break useful references; explicit banners preserve paths and clarify authority.
- **Delete completed plans:** rejected because they remain useful evidence of prior scope and implementation intent.
- **Duplicate architecture in each instruction file:** rejected because operational constraints and explanatory system maps have different maintenance lifecycles.

## Consequences

- Agents must read the root and nearest scoped instruction file, then use the router to load only task-relevant context.
- Moving a file between packages may change the effective instructions that apply to it.
- Changes to ownership boundaries, commands, scripts, or documentation paths must update the corresponding architecture, runbook, or router entry.
- Historical plans remain searchable but cannot override current source, tests, protocol, scoped instructions, or accepted decisions.
- Documentation integrity checks should validate local links, referenced npm scripts, scoped files, and plan banners whenever this hierarchy changes.
