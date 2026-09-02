# Generated Identifiers in Root Schema Alternatives

## Context

MongoDB adds `_id` to inserted documents. TypeFerry already adds an ObjectId
allowance when a registered payload schema is one strict root object, but strict
object alternatives beneath a root union remained closed to `_id`. Canonical
payload schemas intentionally omit generated identifiers so native driver
`WithId<T>` and `insertedId` typing remain accurate.

## Decision

After BSON-schema conversion, TypeFerry traverses only root-level `allOf`,
`anyOf`, and `oneOf` alternatives. Each reachable object schema receives the
same generated ObjectId property used for a direct root object unless that
branch already declares `_id`.

The traversal never enters `properties`, `items`, or other nested domain
schemas. Explicit identifier schemas are preserved unchanged.

## Rejected alternatives

- Adding `_id` to application payload schemas was rejected because it
  misrepresents insert inputs and violates the canonical persistence contract.
- Recursing through every schema node was rejected because it would allow
  MongoDB identifiers inside nested domain objects.
- Making strict union branches permissive was rejected because it would weaken
  unrelated stored-shape enforcement.

## Consequences

- MongoDB-generated identifiers pass strict root object unions without weakening
  their alternatives.
- Nested objects continue rejecting unmodeled `_id` fields with code 121.
- Future combinator changes must preserve the root-only traversal boundary.
