# Local document collections

The optional [`typeferry/minimongo`](../../typeferry-ts/src/minimongo/README.md)
subpath provides TypeFerry's local, in-memory document database. Despite the
stable import-path name, its behavior is a TypeFerry contract.

Use it for typed application state that benefits from Mongo-style queries,
immutable documents, and event-driven live results. It does not automatically
connect to TypeFerry methods, events, MongoDB live publications, or the wire
protocol.

```text
application mutation
        |
        v
 LocalCollection event
        |
        v
 affected Cursor events
        |
        +-- added / changed / removed
        +-- complete change snapshot
```

Documents use lowercase 24-character hexadecimal string IDs, matching
TypeFerry's normal client representation for MongoDB ObjectIds. Returned
documents are deeply readonly and frozen, and unchanged documents are shared
between cursor snapshots.

See the package guide's [API reference](../../typeferry-ts/src/minimongo/README.md#api-reference)
for every exported class, function, and type, plus supported operators, event
payloads, errors, and listener lifecycle.
