# TypeFerry Strict TypeScript Unification

## Problem

The TypeScript package has two different type-safety contracts. The general
`typeferry-ts/tsconfig.json` permits implicit `any` and does not enable the
strict family, unchecked-index checking, or exact optional-property checks. The
Minimongo subpath adds those checks through a second typecheck-only config.
This lets missing contracts and unsafe optional/index access remain elsewhere
in the package source and tests.

TypeFerry needs one authoritative strictness contract for all TypeScript under
`typeferry-ts/src`, including tests. The production build may retain a derived
configuration containing only emission and production-file selection options.

## Evidence

- `typeferry-ts/tsconfig.json` currently sets `noImplicitAny: false` and omits
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
  `useUnknownInCatchVariables`.
- `typeferry-ts/tsconfig.minimongo.json` enables that strict profile only for
  `src/minimongo`.
- Applying the profile to the package currently reports 387 errors across 92
  files: 111 errors in production source and 276 in tests.
- The standalone `template/` project already has its own strict configuration
  and must remain independently usable outside this repository.

## Agreed scope

### Included

- Make `typeferry-ts/tsconfig.json` the only package-wide typechecking and
  strictness authority.
- Enable `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables` for all source
  and tests.
- Remove `typeferry-ts/tsconfig.minimongo.json` and its package script.
- Retain `typeferry-ts/tsconfig.build.json` only as a derived emission profile;
  it must not weaken type-safety options.
- Add or repair concrete internal and public contracts wherever a type is
  missing or unsound.
- Update public type-contract tests and documentation for intentional type-only
  API corrections.

### Excluded

- Combining the standalone application template with the package config.
- Changing TypeFerry wire behavior, `PROTOCOL.md`, or conformance fixtures.
- Using `any`, blanket assertions, `@ts-ignore`, `@ts-expect-error` outside
  negative contract tests, or weaker compiler settings to achieve a green
  build.
- Runtime feature changes unrelated to a strictness finding.

## Contracts and constraints

```text
typeferry-ts/tsconfig.json
        | strict options + all source/test inputs
        |
        +-- tsc --noEmit               package typecheck
        |
        `-- tsconfig.build.json        emit paths + production exclusions only
```

Compiler findings must be resolved according to the runtime invariant:

- Values that are genuinely optional are represented as optional or
  `T | undefined`, and are omitted from exact-optional object literals when
  absent.
- Values guaranteed by lifecycle or validation are narrowed at the point where
  that guarantee is established.
- Dynamic dictionaries and callbacks receive explicit key/value, parameter,
  return, and `this` contracts.
- Public contract corrections may be breaking at compile time, as explicitly
  approved, but must not silently change runtime or wire behavior.
- Test fixtures must model the same contracts as production; tests do not gain
  weaker compiler settings.

## Test strategy and acceptance criteria

The strict compiler invocation is the initial failing acceptance test. Each
ownership slice is repaired while the existing configuration remains in place,
then verified with its narrow runtime suite and a fresh strict diagnostic. New
or corrected public declarations receive positive and negative compile-time
contract cases before or alongside implementation changes.

- [ ] Strict diagnostics are reduced to zero without forbidden suppressions or
      newly introduced explicit `any`.
- [ ] Public type corrections have compile-time contract coverage.
- [ ] `tsconfig.json` owns the complete strict profile for all package source
      and tests.
- [ ] `tsconfig.minimongo.json` and `typecheck:minimongo` are removed.
- [ ] `tsconfig.build.json` contains only build-specific differences and inherits
      all strictness options.
- [ ] Existing runtime behavior remains covered by the affected unit suites.
- [ ] Full unit, integration, and browser suites pass when their external
      prerequisites are available.
- [ ] Lint, unified typecheck, production build, package verification, and
      packed-consumer verification pass.
- [ ] Documentation no longer describes Minimongo as having a separate compiler
      strictness tier.

## Implementation checklist

1. Commit this specification and the failing strict baseline.
2. Repair shared utilities, EJSON, and foundational contracts.
3. Repair client, authentication, React, and native contracts and fixtures.
4. Repair server, transport, decorator, and application-tooling contracts.
5. Repair MongoDB extension contracts and fixtures.
6. Repair remaining repository test and conformance harness contracts.
7. Promote strictness into `tsconfig.json`, remove the Minimongo config/script,
   and verify the derived production build profile.
8. Update architecture and contributor documentation.
9. Run full verification and record the architectural decision.

## Risks and recovery

- Exact optional properties can expose a distinction between an absent property
  and a present `undefined` property. Preserve runtime shape unless the existing
  shape violates an explicit public contract.
- Unchecked index access can reveal real empty-list and missing-map-entry paths.
  Narrow those paths instead of asserting them away.
- Callback and schema types can change declaration compatibility. Cover each
  public correction and document it before release.
- Large test-only edits can obscure production changes. Keep commits scoped by
  ownership boundary and run the narrowest suite first.

Recovery is commit-level reversion. This change introduces no persisted-data or
wire migration. If a public type correction cannot preserve intended behavior,
stop at that slice and present the incompatible alternatives before proceeding.

## Direct rollout

The strict configuration lands only after every package source and test file
passes it. There is no staged runtime rollout: compiler enforcement becomes the
repository gate in the same commit that removes the redundant Minimongo config.

## Verification record

To be completed after implementation with executed commands, skipped checks,
environmental limitations, and residual uncertainty.
