# Agent-first consumer documentation

Date: 2026-09-03
Status: accepted

## Context

TypeFerry already uses scoped `AGENTS.md` files, architecture pages, runbooks,
specifications, and decisions to guide agents maintaining the monorepo. Those
instructions assume repository access and maintainer responsibilities. Agents
building applications with the published framework need a smaller consumer
contract focused on supported imports, conventions, workflows, and validation.

The community [`llms.txt` proposal](https://llmstxt.org/) offers a concise
Markdown discovery index for documentation. It does not guarantee automatic
tool discovery and is not an access-control mechanism. `AGENTS.md` remains the
appropriate scoped instruction file inside a working application.

## Decision

Maintain `docs/agents/application-development.md` as the canonical guide for AI
coding agents building TypeScript consumer applications. It routes agents to
detailed human-readable feature guides while owning the compact application
workflow, supported project conventions, safety boundaries, and completion
contract.

Maintain a repository-root `llms.txt` as a discovery-oriented index of public
documentation. It links to canonical Markdown using stable repository URLs and
explicitly separates consumer guidance from optional maintainer context.

The package README links to the consumer-agent guide so agents starting from
the source package, and from the registry after the next normal release, can
discover it. The template's scoped `AGENTS.md` links to the same guide and adds
only template-specific constraints. Human documentation remains authoritative;
agent-oriented files route and condense it rather than defining an independent
framework contract.

## Rejected alternatives

- Put consumer instructions in the root `AGENTS.md`: rejected because its scope
  is maintaining TypeFerry, not operating within an unrelated application.
- Duplicate full documentation in `llms-full.txt`: rejected because generated
  duplication would drift without a documentation build pipeline and waste
  agent context.
- Add tool-specific instruction files: rejected because they would duplicate
  policy and make behavior depend on the selected coding agent.
- Ship a separate documentation tree in the npm tarball: deferred because the
  package README already provides a registry-visible bridge and changing the
  tightly validated artifact is unnecessary for this outcome.

## Rationale

This split uses progressive disclosure. An application agent receives the
smallest operational contract first and follows feature links only when its
task requires them. Maintainer instructions retain their existing authority
without leaking release and monorepo workflow into consumer applications.

## Consequences

- Consumer-facing behavior must update the agent guide when commands,
  configuration fields, public exports, path conventions, or verification
  expectations change.
- Template-specific `AGENTS.md` instructions should link rather than copy the
  shared consumer workflow.
- `llms.txt` must remain concise, navigational, and non-normative.
- Documentation review must check agent guidance against executable package and
  template contracts.
