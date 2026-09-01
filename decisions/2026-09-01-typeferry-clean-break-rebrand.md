# TypeFerry Clean-Break Rebrand

## Context

The project needed a distinctive new identity across its TypeScript, Python, and Rust implementations. Its brand was embedded in public APIs, import and crate names, wire paths, Redis keys, templates, automation, documentation, and historical records. Final public registry coordinates and replacement hosting were intentionally left undecided.

The legacy Forgejo repository was preserved as a recovery snapshot at commit `e08874ee9fe432b372d66f395e448c69ed24351b`, and the local `origin` remote was removed before implementation.

## Decision

Adopt TypeFerry as a clean break across the complete tracked repository:

- implementation roots are `typeferry-ts`, `typeferry-py`, and `typeferry-rs`;
- public APIs, imports, Rust crates, protocol identifiers, storage keys, fixtures, templates, and records use TypeFerry naming without compatibility aliases;
- the protocol revision is 2 because the wire path and distributed keys are intentionally incompatible;
- temporary package identities are `typeferry-ts`, `typeferry-py`, and `typeferry-*`;
- all temporary packages are private or non-publishable, and publish/release-bump automation is removed;
- the template consumes the TypeScript package through a repository-local file dependency;
- repository and registry URLs remain explicit pending values rather than guessing future infrastructure;
- the repository root is renamed to `<user-home>/Repositories/example-app/typeferry` after the implementation commit.

Protocol-governed source, fixtures, implementations, and documentation are committed atomically so no commit represents a mixed wire contract.

## Rejected Alternatives

- Compatibility aliases and dual wire identifiers were rejected because the requested migration is a clean break.
- Reusing provisional scoped registry names was rejected because final npm, PyPI, Cargo, and hosting identifiers have not been approved.
- Renaming only active source while preserving historical wording was rejected because the requested scope includes every historical occurrence and filename.
- Renaming the existing Forgejo repository was rejected to retain an immutable, remote recovery point.

## Rationale

An atomic cutover makes the contract legible: every implementation either speaks protocol revision 2 under TypeFerry identifiers or is a legacy implementation. Disabling publication prevents temporary names from becoming accidental public contracts. Keeping the old remote untouched provides straightforward recovery without coupling the local rebrand to hosting decisions.

## Consequences

- Existing consumers do not receive an automated migration path and must deliberately adopt future TypeFerry packages.
- Legacy clients and servers cannot interoperate with TypeFerry where renamed wire paths or distributed keys are involved.
- Publication remains unavailable until registry coordinates, hosting, and release automation are approved in a later decision.
- Historical records describe the same decisions under the current TypeFerry identity; Git history remains the source for the original wording.
- Rollback consists of renaming the local directory back and reverting the local rebrand commit, or recloning the untouched remote save point.
