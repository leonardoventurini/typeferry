# MongoDB Schema Enforcement and 0.7.0 Release

Project: `typeferry`  
Project root: `/Users/leonardo/Repositories/leonardoventurini/typeferry`  
Root ID: `ccc18213`

## Context

The MongoDB registry is gaining bounded Zod-to-BSON schema compilation and
strict/error validator reconciliation. The feature is specified in
`specs/2026-09-02-mongodb-zod-schema-enforcement.md` and is a public package
surface. The repository currently publishes `typeferry@0.6.1`; the package
manifest and lockfile must remain unchanged until the implementation and its
release gate are ready to be committed atomically.

## Decision

Release the schema-enforcement feature as `typeferry@0.7.0`. The release
sequence is:

1. Complete implementation and focused/full verification.
2. Bump `typeferry-ts/package.json` and its lockfile to `0.7.0` in the release
   commit.
3. Run the complete non-uploading npm release gate from a clean `main`
   checkout.
4. Publish `typeferry@0.7.0` manually to the public npm registry.
5. Only after npm confirms the upload, create the annotated tag `v0.7.0` and
   push the release commit and tag.

No GitHub release is created. The existing release recipe remains the only
publication entry point and does not create tags or push Git state itself.

MongoDB structure represented by the supported compiler is enforced in the
database with `validationLevel: "strict"` and `validationAction: "error"`.
Zod refinements and cross-field domain rules remain application-level
validation when they cannot be represented in MongoDB's BSON schema dialect.

## Rationale

The minor pre-1.0 bump communicates a new public capability while preserving
the project's pre-1.0 versioning policy. Publishing before tagging ensures
the tag identifies a version that actually exists in npm. Keeping tagging
manual and post-publication preserves the existing credential and irreversible
mutation boundary, while an annotated `v0.7.0` tag gives consumers and
maintainers a durable release anchor without introducing GitHub release
automation.

Database enforcement is intentionally bounded and fail-closed: emitting an
unconstrained validator for an unsupported Zod construct would create a false
sense of protection. Native MongoDB clients, sessions, transactions, and
collections remain available to applications.

## Consequences

- `0.7.0` cannot be reused after publication; a faulty release must be
  deprecated and corrected with a higher version.
- The release commit must be clean and independently verifiable before npm
  publication.
- Operators must push the release commit and `v0.7.0` tag after successful
  publication; neither action is performed by `just publish-npm`.
- Applications must repair legacy documents that do not satisfy a newly
  enforced validator before enabling startup reconciliation.
- MongoDB validators enforce structural BSON constraints, while domain-level
  refinements continue to require Zod or application validation.

## Rejected alternatives

- Tagging before publication was rejected because it could advertise a release
  version that npm rejected or that was never uploaded.
- Automated tag or GitHub release workflows were rejected because publication
  credentials and irreversible release mutations remain operator-controlled.
- Treating every Zod refinement as a database validator was rejected because
  arbitrary refinements do not have a faithful BSON-schema representation.
- Replacing native MongoDB handles with an ORM or wrapper was rejected because
  sessions, transactions, aggregations, and bulk operations remain application
  responsibilities.
