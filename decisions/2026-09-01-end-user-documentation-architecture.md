# End-User Documentation Architecture

## Context

TypeFerry has three implementations with a shared protocol but different user surfaces. The repository previously routed contributors and agents well while giving end users no root introduction or coherent development path. Registry publication is intentionally disabled.

## Decision

The root README is the public landing page and gives TypeScript, Python, and Rust equal visibility. `docs/README.md` is the task-oriented end-user index. A repository-local TypeScript template is the primary runnable quickstart, and focused guides document each TypeScript framework surface. Python and Rust package READMEs are self-contained server-development entry points and state their lack of browser/UI clients.

Protocol behavior remains normative in `PROTOCOL.md`; architecture, conformance, runbooks, plans, and agent guidance remain separately routed contributor material. Examples use only public package surfaces and explicitly describe unpublished-package and security boundaries.

## Rejected alternatives

- A TypeScript-only root README would hide supported cross-language servers.
- One long README would make framework-specific tasks difficult to navigate and maintain.
- Registry install commands would imply availability that current package guards intentionally prevent.
- Duplicating the wire protocol in tutorials would create competing normative sources.

## Rationale

This structure provides a short discovery path while keeping each guide independently reviewable. Package-local READMEs work for developers entering through a language directory, and links back to shared protocol/conformance documents prevent drift.

## Consequences

New public surfaces should update the appropriate focused guide and documentation index. Publication must replace the local-only installation language across all three implementation entry points. Protocol changes continue to update `PROTOCOL.md` and conformance fixtures, not merely tutorials.

## 2026-09-03 amendment

The TypeScript package is now published, and `0.8.0` adds the package-owned
application framework. `docs/typescript/application-framework.md` is the
canonical end-user guide for its develop, build, test, configuration,
migration, and upgrade workflows. The root README and documentation index must
present that workflow directly instead of routing it only through the template
or an architecture document.

The original unpublished-package statements above record the context in which
this decision was made; current publication status is maintained in
`RELEASING.md`.
