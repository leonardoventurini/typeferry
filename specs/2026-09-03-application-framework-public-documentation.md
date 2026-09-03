# Application framework public documentation

Status: accepted

## Problem

TypeFerry `0.8.0` added package-owned application commands, conventional
project structure, optional typed configuration, and a test API. These surfaces
are documented in the package README, template, architecture proposal, and
consumer-agent guide, but the root README and end-user documentation index do
not present the application framework as a first-class workflow. There is no
focused public guide to serve as the canonical destination.

## Evidence

- `typeferry-ts/README.md` describes `develop`, `build`, `test`,
  `typeferry/config`, and `typeferry/test`.
- `docs/architecture/application-framework-toolchain.md` contains the detailed
  design but is informative architecture documentation.
- `README.md` introduces runtime APIs and the template without explaining the
  zero-config framework workflow.
- `docs/README.md` has no application-framework task entry.
- `docs/getting-started.md` uses `npm run develop` and `npm run build` without
  routing readers to a command/configuration reference.

## Desired outcome

Developers and coding agents can discover the application framework from every
primary entry point, understand what TypeFerry owns, adopt its conventional
workflow without unnecessary configuration, customize only supported fields,
and migrate from application-owned Vite/Vitest boilerplate.

## Scope

- Add a focused end-user application-framework guide.
- Update the root README to introduce the framework commands and conventions.
- Route the documentation home, quickstart, package README, consumer-agent
  guide, deployment guide, and `llms.txt` to the canonical guide.
- Document commands, arguments, paths, build artifacts, test projects, optional
  setup files, supported configuration, ownership boundaries, migration, and
  troubleshooting.
- Keep the architecture proposal as the design-level reference.

## Out of scope

- Runtime, CLI, configuration, package, dependency, or protocol changes.
- New configuration fields or compatibility guarantees.
- Scaffolding, managed lint/format/TypeScript presets, or container management.

## Contracts and acceptance criteria

- [ ] The guide matches CLI parsing, `TypeFerryConfig`, test discovery, and
      generated build paths.
- [ ] The root README presents the three package-owned commands prominently.
- [ ] Public documentation routes framework questions to one canonical guide.
- [ ] Migration guidance removes obsolete Vite/Vitest/development-script files
      without implying that TypeFerry owns unrelated application tooling.
- [ ] Examples use only public package exports and current syntax.
- [ ] All introduced local links resolve and Markdown formatting passes.
- [ ] The diff contains documentation only.

## Risks and recovery

Documentation can drift from executable defaults or overstate framework
ownership. Validate every command, field, filename, and artifact against source
and the template. Recovery is a normal revert; no runtime or data rollback is
required.

## Direct rollout

Merge directly to `main`. Repository documentation updates immediately. The
updated package README reaches the npm registry with the next normal release;
no documentation-only package release is required.

## Executable checklist

- [ ] Add the canonical application-framework guide.
- [ ] Update all public entry points and cross-links.
- [ ] Verify documentation against source and template contracts.
- [ ] Update the existing end-user documentation architecture decision.
- [ ] Commit the documentation unit semantically.
