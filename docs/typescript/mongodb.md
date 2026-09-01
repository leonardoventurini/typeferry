# MongoDB Extension

The optional TypeScript MongoDB extension builds typed collections, decorators, observers, and TypeFerry invalidation on the official MongoDB driver.

Import runtime APIs from `typeferry/mongodb` and decorator APIs from `typeferry/mongodb/decorators`. The detailed current API reference and examples live in [`src/mongodb/README.md`](../../typeferry-ts/src/mongodb/README.md).

## Development model

1. Create and own the `MongoClient` in application startup.
2. Define collection document types and runtime schemas.
3. Register collections and indexes before accepting traffic.
4. Scope every read and mutation by the authenticated principal where required.
5. Emit or observe invalidations only after acknowledged writes.
6. Close observers and the MongoDB client during graceful shutdown.

Change streams require a replica set, including during local development. The repository [template](../../template/README.md) supplies a single-node replica set, migrations, health checks, and an owner-scoped event flow. Its application code uses the official driver directly and is also a useful baseline when the extension is more abstraction than a service needs.

Never build a query directly from unchecked client input. Validate filters, projection, sorting, pagination, and tenant ownership on the server. Database credentials belong in runtime secret injection, not source or client bundles.
