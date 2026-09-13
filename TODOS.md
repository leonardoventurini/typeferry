# TypeFerry TODOs

`PROTOCOL.md` is the normative wire authority. The Ruby, Rust, Python, and
TypeScript servers must agree with it and with the shared conformance fixtures.
No language implementation may become an undocumented second protocol.

## Bidirectional server parity

- [ ] Build one generated coverage matrix mapping every normative protocol clause and fixture to TypeScript, Python, Rust, and Ruby tests.
- [ ] Require every Ruby-visible wire change to update `PROTOCOL.md`, shared fixtures, and every affected server in the same change.
- [ ] Require changes originating in TypeScript, Python, or Rust to update Ruby in the same change when Ruby implements that surface.
- [ ] Run the TypeScript client interoperability suite against all four servers in CI. Ruby is available as the mandatory `typeferry-ts` `test:interop:ruby` gate; Python and Rust still need equivalent gates.
- [ ] Add negative fixtures for malformed envelopes, protected methods, authorization failures, origin rejection, and boundary limits.
- [ ] Keep HTTP, WebSocket, Redis, EJSON, auth defaults, errors, events, rooms, cache keys, and lifecycle behavior in the matrix.
- [ ] Prevent a server from claiming conformance when a required fixture is skipped or special-cased.
- [ ] Record intentional feature-parity gaps separately from wire-protocol failures.

## Known parity work

- [ ] Align duplicate client UUID replacement semantics in every server and shared lifecycle tests.
- [ ] Align request metadata exposed to application handlers without changing wire envelopes.
- [ ] Add the Ruby server-channel authoring facade or document why direct event registration is the canonical Ruby API.
- [ ] Align Rust WebSocket `meta` parsing with the protocol and Ruby/TypeScript behavior.
- [ ] Verify configured HTTP origin enforcement and the 120-request default limiter across server adapters.
- [ ] Exercise Redis reconnect, cleanup, and originator exclusion across mixed-language server pairs.

## Release gate

- [ ] Make cross-language conformance and interoperability mandatory before enabling Python, Rust, or Ruby publication.
- [ ] Publish a machine-readable conformance report with each server release candidate.
- [ ] Reject releases when normative prose, fixtures, server behavior, or documented support status disagree.
