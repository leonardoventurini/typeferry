# TypeFerry MongoDB Driver-First Registry

## Decision

`typeferry-ts/mongodb` is implemented as a thin bridge over the official
MongoDB driver. It exposes native `Collection<TDocument>` handles, decorator
metadata, explicit helpers, and change-stream-to-TypeFerry event wiring.

It does not implement repositories, query builders, hydrated documents,
automatic populate, or plugin middleware.

## Rationale

ExampleApp's Mongoose usage mixes useful database plumbing with hidden behavior:
implicit filters, model statics, hooks, plugins, query thenables, and populate.
Recreating those concepts under a TypeFerry name would keep the migration complex
and preserve the same failure modes.

The driver already has the right primitives for queries, sessions,
transactions, aggregation, and bulk operations. TypeFerry adds value around
registration, typed metadata, event emission, and explicit migration helpers.

## Type Contract

Class decorators cannot change the TypeScript type of a class. The package
therefore uses `typedMongoCollection<TDocument>(Class)` to create a typed token
from a decorated class.

Runtime metadata remains on the class. Compile-time document inference lives on
the token.

## Testing Contract

The package has unit tests for decorators, type inference, registry behavior,
schema helpers, filters, timestamps, find-or-create, and change-stream
payloads.

The integration suite uses `mongodb://127.0.0.1:27017` and the guarded database
`typeferry_mongodb_integration_test` by default. Cleanup refuses to run unless the
database name is explicitly in the TypeFerry MongoDB test namespace.

Change-stream integration uses the same local MongoDB instance but only asserts
watch behavior when the server supports change streams.

## Consequences

Application code becomes more explicit during migration. Relationship loading,
business-rule writes, and side effects move into app-owned services instead of
package-level magic.

The package stays smaller, preserves native driver type coverage, and avoids a
long-term obligation to mimic Mongoose semantics.
