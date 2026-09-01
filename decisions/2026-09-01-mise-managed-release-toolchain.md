# Mise-managed npm Release Toolchain

## Context

The npm release recipes required exact Node.js and npm versions but invoked whichever executables were active in the operator's shell. This made the safety gate reproducible only after a separate, undocumented activation step and allowed registry checks to succeed before a later toolchain mismatch stopped the workflow.

The repository already standardizes local tool selection on Mise, and Mise supports both the required Node.js `24.19.0` and npm `11.17.0` tools.

## Decision

Pin the npm release toolchain in the repository-root `.mise.toml`. Both the non-publishing verification recipe and the publishing recipe run a shared `mise install` prerequisite, then execute every Node.js and npm operation through `mise exec`.

Keep explicit version assertions after tool selection. They provide a fail-closed check that the configured environment matches the package's release contract. Keep Git and shell checks outside Mise because they do not depend on the JavaScript toolchain.

## Rejected Alternatives

- Requiring operators to activate the correct versions manually was rejected because it preserves the failure mode that prompted this change.
- Selecting pinned versions but refusing to install missing tools was rejected because the approved workflow should be self-preparing once Mise is installed.
- Encoding versions only in command-line arguments inside the `justfile` was rejected because a root toolchain file is easier for Mise and humans to discover and reuse.
- Managing only Node.js through Mise was rejected because the package requires an exact npm version independently of the Node.js distribution's bundled npm.

## Consequences

- Mise is the sole release-toolchain prerequisite; Node.js and npm do not need to be preselected in the invoking shell.
- The first release invocation may download tools and therefore requires network access before verification begins.
- Package installation, validation, authentication, and publication all see the same pinned toolchain environment.
- Updating the release toolchain requires synchronized changes to `.mise.toml`, the TypeScript package engine metadata, tests, and release documentation.
