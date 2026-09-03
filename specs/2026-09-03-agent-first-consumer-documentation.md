# Agent-first consumer documentation

Status: accepted

## Problem

TypeFerry has strong instructions for agents maintaining this monorepo, but an
agent building a consumer application must assemble framework conventions from
the template, package README, architecture proposal, and feature guides. That
increases context use and makes it easier to invent unsupported configuration,
import internal modules, or omit required verification.

## Evidence

- `docs/agents/README.md` routes repository maintenance rather than consumer
  application development.
- `template/AGENTS.md` contains useful application constraints, but it assumes
  the complete MongoDB template and is not linked as a reusable consumer guide.
- `docs/architecture/application-framework-toolchain.md` accurately describes
  the CLI but is an architecture record rather than a task-oriented entry point.
- The npm README documents runtime APIs but does not give agents a compact
  build sequence, stop conditions, or verification contract.
- The `llms.txt` proposal provides a compact Markdown index for agent-oriented
  documentation discovery, while `AGENTS.md` is the established repository
  instruction filename. Neither replaces authoritative framework docs.

## Desired outcome

An AI coding agent should be able to discover one canonical guide, determine
whether the conventional application workflow fits, create or modify a
TypeFerry application using only public package surfaces, and verify the result
without reading framework source code.

## Scope

- Add a concise consumer-agent guide for TypeScript applications.
- Add a repository-root `llms.txt` navigation index.
- Make the guide discoverable from the root, documentation home, npm README,
  and template agent instructions.
- Separate consumer guidance from monorepo-maintainer guidance.
- Document defaults, supported customization, public imports, workflow,
  security boundaries, common failure modes, and observable completion checks.

## Out of scope

- Runtime, CLI, configuration, protocol, or package export changes.
- Publishing documentation files inside the npm tarball beyond its README.
- A documentation website or deployment pipeline.
- Tool-specific instruction duplicates such as `CLAUDE.md` or Copilot files.
- Promising that every model or agent automatically discovers `llms.txt`.

## Uncertainty and assumptions

- Consumer agents may begin from the template, a cloned repository, an npm
  package page, or linked web documentation. The same canonical guide must be
  reachable from each relevant entry point.
- `llms.txt` is treated as a community discovery convention, not access
  control, normative behavior, or a guaranteed ingestion mechanism.
- TypeScript is the initial application-framework surface. Python and Rust are
  server implementations and remain linked separately.

## Documentation contracts

1. Consumer agents are directed to public exports and never to `src/` imports.
2. Conventional applications use `client/`, `common/`, `server/`, and `test/`,
   with no required `typeferry.config.ts`.
3. Only the fields currently accepted by `TypeFerryConfig` are documented.
4. Commands distinguish framework-owned develop/build/test behavior from
   application-owned lint, typecheck, formatting, runtime, and deployment.
5. Examples call out authentication, authorization, runtime validation,
   environment secrets, and graceful shutdown boundaries.
6. Completion is observable through named commands and expected artifacts.
7. Maintainer instructions remain authoritative only for repository work.

## Risks

- Duplicated facts can drift from source or feature guides.
- Overly prescriptive instructions can imply unsupported scaffolding.
- A large agent guide can waste context and obscure the task path.
- Relative links can work in GitHub but fail when rendered as the npm README.

Mitigations: keep the guide as a routing and workflow document, link detailed
feature guides, use stable public symbols and commands, keep npm-facing links
absolute where necessary, and verify all repository-relative links.

## Recovery

This work is documentation-only. Revert the documentation commit if guidance
is inaccurate; no consumer code, persisted data, package artifact, or protocol
rollback is required.

## Direct rollout

Land the guide and discovery links on `main`. The existing documentation host
or repository renderer can expose `llms.txt`; no package publication is needed
because the npm README links to the canonical repository guide.

## Verification

- Check Markdown formatting.
- Resolve every local Markdown link introduced by this change.
- Compare documented configuration fields with `TypeFerryConfig`.
- Compare documented commands and imports with `package.json` exports and the
  template scripts.
- Confirm no runtime or package manifest changes are present.

## Executable checklist

- [ ] Add the canonical consumer-agent guide.
- [ ] Add the `llms.txt` discovery index.
- [ ] Link the guide from all relevant documentation entry points.
- [ ] Align the template's scoped agent instructions with the canonical guide.
- [ ] Verify formatting, links, commands, imports, and configuration fields.
- [ ] Record the durable documentation architecture decision.
