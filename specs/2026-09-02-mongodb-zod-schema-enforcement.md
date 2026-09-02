# MongoDB Zod Schema Enforcement

## Problem

`@MongoSchema` currently stores a Zod schema only for explicit parsing helpers. Applications must separately author and reconcile MongoDB `$jsonSchema` validators, duplicating structural contracts and allowing drift.

## Evidence

- The MongoDB registry never consumes schema metadata during startup.
- `ensureIndexes()` already provides an explicit, idempotent reconciliation pattern.
- TypeFerry deliberately returns native driver handles; sessions, transactions, aggregations, and bulk writes remain application concerns.
- Zod 4 emits JSON Schema for representable structure, but BSON `ObjectId` and `Date` need TypeFerry-owned mappings and arbitrary refinements cannot be translated faithfully.
- MongoDB validators cover all writes, including external writers, with strict/error enforcement on collection creation and `collMod`.

## Desired Outcome

Make `@MongoSchema` the application-owned structural schema declaration. TypeFerry derives a MongoDB BSON schema and reconciles strict/error database validation before traffic starts, while preserving native driver access and explicit Zod parsing helpers.

## Scope and Contracts

- Preserve `@MongoSchema(schema)` as an additive public API.
- Export a pure compiler from supported Zod schemas to MongoDB `$jsonSchema` documents.
- Add BSON-aware schema helpers for native `ObjectId` and `Date` values.
- Preserve required, optional, nullable, strict-object, array, union, literal/enum, string, and representable numeric constraints.
- Permit generated `_id` when payload schemas omit it; an explicit `_id` contract takes precedence.
- Fail deterministically for unsupported structural constructs instead of emitting unconstrained validators.
- Keep refinements and `superRefine` rules in Zod/domain validation unless their underlying structural constraints are representable.
- Add `TypeFerryMongo.ensureSchemas()` and startup option `ensureSchemas: true`.
- Reconciliation creates missing collections with validation and uses `collMod` for existing collections, with `validationLevel: "strict"` and `validationAction: "error"`.
- Do not wrap native collections, intercept driver methods, hide sessions, or introduce an ORM.
- Leave indexes independently opt-in through `ensureIndexes()`.
- Repeated reconciliation is safe, and startup failure closes an owned client.

## Test Strategy

1. Unit-test compiler output for nested strict objects, generated `_id`, BSON helpers, optional/null fields, arrays, unions, enums, and constraints.
2. Unit-test loud rejection of unsupported structural types.
3. Test decorator metadata and new registry/type contracts.
4. Integration-test missing-collection creation, existing-collection `collMod`, idempotence, strict/error options, valid BSON, and rejected invalid writes.
5. Test startup opt-in and owned-client cleanup on failure.
6. Run lint, strict typecheck, all split suites, build, package dry run, release-artifact validation, and dependency audit.

## Risks and Recovery

- JSON Schema and MongoDB's BSON dialect differ. The compiler supports a bounded subset and fails closed elsewhere.
- Cross-field refinements remain application invariants.
- Strict validation may expose legacy invalid records; consumers must repair data before enabling it.
- `collMod` needs suitable privileges and startup fails visibly without them.
- Before publication, revert normally. After publication, deprecate a faulty version and publish a higher version; never reuse `0.7.0`.

## Direct Rollout

1. Implement and verify on TypeFerry `main`.
2. Record the decision and bump the TypeScript package to `0.7.0`.
3. Run the complete release gate from a clean release commit.
4. Publish `typeferry@0.7.0` and push the release commit plus `v0.7.0` tag.
5. Upgrade VitaFlow, convert all collections, run migrations before reconciliation, and remove application-authored validators.

## Executable Checklist

- [ ] Add failing compiler, metadata, registry, lifecycle, and integration tests.
- [ ] Implement BSON-aware Zod helpers and bounded BSON schema compilation.
- [ ] Implement explicit and startup schema reconciliation.
- [ ] Update MongoDB API documentation and architecture guidance.
- [ ] Add a decision record.
- [ ] Run focused and complete TypeFerry verification.
- [ ] Commit the feature semantically.
- [ ] Bump and verify `typeferry@0.7.0` separately.
- [ ] Publish npm package and push the release commit plus `v0.7.0` tag.
- [ ] Upgrade and fully migrate VitaFlow under its own specification.

## Acceptance Criteria

- [ ] `@MongoSchema` is the only application-authored structural schema needed for TypeFerry-managed MongoDB validation.
- [ ] Supported schemas produce deterministic MongoDB BSON validators.
- [ ] Unsupported structural schemas fail before traffic is accepted.
- [ ] Missing and existing collections receive strict/error validation.
- [ ] Native driver collections, clients, sessions, and transactions remain available without wrappers.
- [ ] Documentation separates database-enforced structure from Zod/domain-only refinements.
- [ ] All TypeFerry release gates pass for `0.7.0`.
- [ ] The npm version and Git tag are published without a GitHub release.
