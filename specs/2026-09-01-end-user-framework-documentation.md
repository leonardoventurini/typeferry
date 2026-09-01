# End-User Framework Documentation Specification

## Problem

The public repository has no root README, no TypeScript package README, and no coherent end-user development guide. TypeFerry's usable surfaces are discoverable only by reading source, tests, the application template, and a MongoDB-specific README. Python and Rust have brief package READMEs, but they do not provide enough guidance to build a server or understand feature boundaries.

## Evidence

- Root `README.md` and `typeferry-ts/README.md` do not exist.
- `typeferry-ts/package.json` exports client, server, decorators, transports, auth, React, Lit, EJSON, MongoDB, and utilities.
- `template/` contains a working TypeScript server, decorator-based methods, client configuration, React provider, hooks, events, persistence, and deployment example.
- Python and Rust implement server-side parity but do not provide browser clients or React/Lit adapters.
- Package publication remains disabled, so registry install commands would be misleading.

## Desired Outcome

Provide a welcoming repository README and a navigable end-user documentation set that lets developers understand TypeFerry, choose an implementation, run the local application template, build servers in TypeScript/Python/Rust, and use the TypeScript client, React, Lit, auth, events/channels, MongoDB, EJSON, and deployment surfaces.

## Scope and Assumptions

- Give TypeScript, Python, and Rust equal top-level visibility and clearly document their different client/server capabilities.
- Add a root `README.md` and `docs/README.md` end-user index.
- Add a local-development quickstart based on `template/`; do not document unpublished registry installation commands as available.
- Add dedicated TypeScript guides for server/RPC, client, React, Lit, auth, events/channels, MongoDB, EJSON, and deployment.
- Expand Python and Rust READMEs into practical server-development guides, linking to their architecture and protocol documents.
- Prefer package exports over internal source imports in every TypeScript example.
- Preserve `PROTOCOL.md` as the normative protocol source and the agent documentation as contributor-facing material.
- Do not change runtime behavior, package publication guards, public APIs, dependencies, or deployment configuration.

## User Contracts

- New users can identify supported languages, maturity, and client/server capabilities from the root README.
- The quickstart reaches a running local template without a registry package.
- Every code example names its file context, imports from current public surfaces, and uses current signatures.
- Guides distinguish conceptual examples from production requirements, especially authentication and deployment.
- Python and Rust documentation never imply the presence of browser/client framework adapters.
- Installation sections state that packages are not yet published and direct users to repository-local workflows.

## Risks and Recovery

- Examples can drift from code. Derive them from current tests/template and validate referenced exports and scripts.
- Comprehensive guides can duplicate protocol text. Explain developer usage and link to `PROTOCOL.md` for normative wire details.
- Unpublished packages can confuse users. Put the publication status before any local setup instructions.
- Security examples can be copied into production. Label sample tokens and in-memory session behavior as development-only.
- Recovery is a normal revert of the documentation commit; runtime state is unaffected.

## Test Strategy and Acceptance Criteria

This is a documentation-only change, so no new runtime tests are required. Existing builds and type checks validate the source surfaces on which examples are based.

- [ ] Root README explains the project, capabilities, implementation matrix, local quickstart, documentation paths, status, and contribution entry points.
- [ ] `docs/README.md` routes learning by task and language.
- [ ] All ten requested TypeScript topics have dedicated, linked guides.
- [ ] Python and Rust READMEs contain practical local installation, minimal server usage, transport/auth boundaries, testing, and limitations.
- [ ] TypeScript examples use only current package export paths.
- [ ] Documented npm scripts and repository paths exist.
- [ ] Local Markdown links resolve.
- [ ] Security-sensitive examples include production warnings and fail-closed guidance where appropriate.
- [ ] Publication status is consistent with `RELEASING.md` and package guards.
- [ ] `git diff --check` and documentation integrity checks pass.
- [ ] Relevant TypeScript typecheck/build/package inspection checks pass, or environmental limitations are disclosed.
- [ ] Python and Rust documentation examples are checked against current exports/tests; skipped execution is disclosed.
- [ ] A decision record captures the end-user documentation information architecture.
- [ ] All task-owned changes are committed semantically and the worktree is clean.

## Executable Checklist

1. Commit this specification.
2. Create the root README and end-user documentation index.
3. Add the local-development quickstart and TypeScript topic guides.
4. Expand the Python and Rust package READMEs with verified server examples.
5. Cross-link user docs, package docs, protocol, template, release status, and contributor guidance.
6. Validate links, paths, exports, scripts, examples, build surface, and publication-status statements.
7. Record the documentation architecture decision.
8. Commit the documentation foundation and report verification against every acceptance criterion.

## Direct Rollout

Merge the documentation commit directly. Repository visitors and package developers can use it immediately; no application deployment or registry publication is involved.

## Verification Reporting

Distinguish executed checks from signature/source inspection. Report any example that could not be executed, current publication limitations, important documentation boundaries, and the recommended review order from root README through quickstart, language guides, and advanced TypeScript topics.
