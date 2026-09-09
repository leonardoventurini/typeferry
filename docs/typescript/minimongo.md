# Minimongo

The optional [`typeferry/minimongo`](../../typeferry-ts/src/minimongo/README.md)
subpath provides a strict, modular in-memory Mongo-style collection for browser
and Node.js application state. It targets Meteor 3.5.2 Minimongo 2.2.0 public
behavior and does not participate in the TypeFerry wire protocol.

Use it for local querying, optimistic state, or observable in-memory caches.
Use [`typeferry/mongodb`](mongodb.md) for persistent server data and authorized
live publications. The two packages intentionally have separate stores and
ObjectID representations; no automatic bridge changes identity or wire
semantics.

The package guide documents the supported operator matrix, security boundary,
extension ports, and upstream limitations.
