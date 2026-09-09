# Unified strict TypeScript compiler contract

## Context

TypeFerry previously applied its strongest TypeScript checks only to Minimongo
through `tsconfig.minimongo.json`. The package-wide `tsconfig.json` explicitly
allowed implicit `any` and omitted strict null, index-access, exact-optional,
and catch-variable checks. This divided the source tree into different safety
tiers and allowed missing contracts outside Minimongo.

The standalone `template/` is an independently consumable application and has
different input and emission needs from the published package.

## Decision

`typeferry-ts/tsconfig.json` is the single typechecking and strictness authority
for every TypeScript source and test file in the package. It explicitly enables
`strict`, `noImplicitAny`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `useUnknownInCatchVariables`.

`typeferry-ts/tsconfig.build.json` remains as a derived production-emission
profile. It may select production inputs and configure output, but it must not
override or weaken the shared safety contract. The dedicated Minimongo config
and script are removed.

The standalone `template/` retains its own strict configuration so it remains
usable outside the monorepo.

Where enforcement exposes an absent or inaccurate contract, TypeFerry adds or
corrects the contract at its owning boundary. Public type corrections may be
compile-time breaking when necessary to match actual runtime behavior; they do
not authorize wire-protocol changes.

## Rejected alternatives

- Keep a separate strict Minimongo tier: this preserves inconsistent guarantees
  and leaves other public surfaces less safe.
- Make the build config authoritative: production exclusions would leave tests
  outside the shared compiler contract.
- Make the application template extend the package config: that couples a
  standalone consumer to repository layout and package-internal inputs.
- Silence findings with broad assertions, suppressions, or weaker flags: this
  hides missing contracts instead of resolving them.

## Rationale

A single source-checking contract makes `npm run typecheck` representative of
the whole TypeScript package. Keeping emission differences in an extending
config preserves clean package output without creating another safety tier.
Explicit index and optional-property checks also align static contracts with
the runtime distinctions most likely to reveal missing values or altered
object shapes.

## Consequences

- All new package source and fixtures must satisfy the same strict profile.
- Public declarations now expose corrected nullability, async iterator,
  authentication, event, React hook, MongoDB result, and transport lifecycle
  contracts where the prior declarations disagreed with runtime behavior.
- Consumers may see compile-time failures where they relied on an unsound old
  declaration; runtime and wire behavior remain unchanged.
- Future compiler settings change once in `tsconfig.json`; build-only settings
  remain in `tsconfig.build.json`.
- Rollback is commit-level and requires restoring both the permissive base
  settings and the removed Minimongo-only checker. No data or protocol migration
  is involved.
