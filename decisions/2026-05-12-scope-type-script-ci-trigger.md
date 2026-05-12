# Scope TypeScript CI Trigger

Date: 2026-05-12
Status: Accepted

## Context

The `ci.yml` workflow only validates `bifrost-ts`, but it was triggered by a
Rust-only lockfile correction. That made unrelated TypeScript runner behavior
able to mark Rust maintenance commits red.

## Decision

Run the TypeScript CI workflow only when TypeScript package files, shared
conformance inputs, the wire protocol, or the CI workflow itself changes.

## Consequences

- Rust-only and Python-only changes no longer consume the TypeScript CI runner.
- Protocol and shared conformance changes still validate the TypeScript package.
- Changes to `ci.yml` continue to self-validate.
