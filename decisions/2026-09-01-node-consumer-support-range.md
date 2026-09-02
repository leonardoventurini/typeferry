# Node.js Consumer Support Range

## Context

The first public TypeFerry release declared Node.js `24.19.0` as an exact npm
consumer engine. That development toolchain pin unintentionally prevented the
Node.js `26.5.1` application template from installing the published package,
even though package development and release verification can remain pinned to
Node.js 24.

## Decision

Beginning with `typeferry@0.6.1`, declare the public Node.js consumer engine as
`>=24.19.0 <27`. Retain exact Node.js `24.19.0` and npm `11.17.0` for package
development, CI, and publication. Verify the package on Node.js 24 through its
release gate and on Node.js 26 through the published-package application
template.

## Rejected Alternatives

- Downgrading the template to Node.js 24 was rejected because the published
  library can support the template's existing Node.js 26 runtime.
- An unbounded `>=24.19.0` range was rejected because future Node.js majors have
  not been exercised.
- Enumerating only exact Node.js 24 and 26 releases was rejected because it
  would unnecessarily exclude compatible patch releases.
- Disabling engine enforcement was rejected because it would hide unsupported
  runtime combinations instead of describing them accurately.

## Consequences

- Consumers on Node.js 24.19.0 through Node.js 26 may install the package.
- Node.js 23 and versions earlier than 24.19.0 remain unsupported, as do
  unverified future Node.js majors.
- Expanding support to Node.js 27 or later requires explicit verification and
  a subsequent release.
- Exact release-toolchain checks remain unchanged and reproducible.
