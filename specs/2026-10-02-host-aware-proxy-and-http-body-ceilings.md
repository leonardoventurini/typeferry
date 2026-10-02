---
status: shipped
created: 2026-10-02
updated: 2026-10-02
owner: TypeScript application tooling and HTTP transport
implementation:
  commits: [62cb276e038daf750501a1738fbcd9064ab5f94a]
---

# Host-aware development proxy and route-specific HTTP body ceilings

## Outcome and approval

A multi-domain application can proxy server-rendered routes only on their owning
hostname and bound sensitive chunked uploads before the HTTP transport buffers
under a larger global allowance. The downstream Leonardo blog specification and
the user's end-to-end implementation request authorize these narrow extensions
and the upstream release workflow. No cross-language wire behavior changes.

## Evidence and scope

`application/proxy.ts` already streams Node requests/responses and preserves Host
when configured; selection currently only uses pathname. `NodeHonoTransport`
installs Hono's body limiter before application middleware. That middleware
buffers requests without Content-Length, so a later small upload limiter cannot
prevent memory consumption under a larger global cap. The installed source and
[Hono body-limit documentation](https://hono.dev/docs/middleware/builtin/body-limit)
confirm this ordering constraint.

## Contracts

- `DevelopmentProxyRoute.hostnames?: readonly string[]` limits selection to exact
  configured hostnames, case-insensitive and without ports. Omitted allowlists
  retain existing behavior. Invalid incoming authorities do not match restricted
  routes. Matching remains segment-scoped; transport streaming/cookies remain
  under the existing proxy owner.
- `ServerOptions.requestBodySizeLimits?: readonly RequestBodySizeLimit[]`, where
  each rule is `{ pathPrefix: string; maxSize: number }`, lowers the global
  `maxRequestBodySize` ceiling. The first middleware selects the minimum matching
  cap before reading the body. Encoded equivalents cannot bypass prefix matching;
  malformed encodings receive the minimum configured cap. Invalid rules reject
  server construction before the listener starts.
- Authentication, file parsing, file validation and host registration remain
  application-owned. There are no data migrations or new dependencies.

## Acceptance criteria and planned verification

1. Selected host requests stream unchanged with their original Host; unmatched
   hosts and prefix siblings continue through the ordinary Vite stack. Verify
   pure selection cases and real Node/Vite streaming integration.
2. Route ceilings reject Content-Length and chunked overflow before application
   handlers run. Verify a real chunked client that never ends its request still
   receives HTTP 413 immediately after overflow.
3. Overlap uses the minimum cap, encoded equivalents cannot bypass it, and route
   rules never raise the global cap. Verify focused transport tests.
4. Existing framework proxy and transport behavior remains compatible. Verify
   affected suites plus required package release checks and packed exports.

## Recovery and verification

Consumers can return to the previous immutable npm release. Production consumers
must remove use of new options before downgrading; no persisted data changes.
The registry reports `0.12.0` as published. Initial new regression tests failed
against the prior implementation as expected. Focused tests subsequently passed.
The operator published `typeferry@0.13.0` after restoring authentication. The
registry reports the exact implementation commit as `gitHead`; all 565 files in
its downloaded tarball match the locally packed verified checkout byte for byte.
The guarded publication recipe refused a duplicate upload when the version was
already available, so the existing immutable release was retained.

## Verification results

- Acceptance 1: passed. Real Vite/Node proxy integration verifies streaming a
  128 KiB request, original Host forwarding, response chunks, hostname fallback
  and segment sibling fallback. Unit selection checks include case/port/trailing
  dot normalization and rejecting credentials, paths and lookalike domains.
- Acceptance 2: passed. Transport tests exercise Content-Length and chunked
  overflow plus rejection while the client deliberately leaves its upload open.
- Acceptance 3: passed. Transport regressions verify minimum overlap, encoded
  equivalents, accepted bounded bodies and unchanged global ceilings.
- Acceptance 4: passed. `just verify-npm-release` ran immutable `npm ci`, lint,
  strict typecheck, split tests, build, packed generic consumer verification and
  `npm pack --dry-run --json` archive validation (565 allowed files).
- Split suites: 1,660 unit, 77 integration and 10 browser tests passed. Three
  explicitly opt-in Ruby interoperability cases were skipped; no protocol
  behavior changes require enabling that suite for this TypeScript-only change.
- After final cleanup, `npm run lint -- --fix`, `npm run typecheck` and the
  focused `npm run test:unit -- src/application/proxy.unit.spec.ts
  src/server/transports/node-hono-transport.unit.spec.ts` passed (20 tests).
- `npm audit --audit-level=low` reported zero vulnerabilities. Immutable install
  warned about an existing deprecated stub types package; no dependency changed.
- Emitted declarations and ESM contain both public APIs. Temporary release-gate
  MongoDB/Redis containers were removed by the gate; existing services were left
  untouched. No downstream checkout tests were invoked by TypeFerry tooling.
- npm publication: passed. Public `typeferry@0.13.0` has `gitHead`
  `62cb276e038daf750501a1738fbcd9064ab5f94a`. Both new public declarations are
  present and all registry tarball contents match the verified source build.
  Downloaded archive SHA-256:
  `0325f3c7df6310f95fd6a84401150147ab78fba626e78b6745c13fed784efb12`.
