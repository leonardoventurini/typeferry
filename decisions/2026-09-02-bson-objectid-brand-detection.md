# BSON ObjectId Brand Detection

## Context

MongoDB live publications accept native ObjectIds returned by the official
driver. In a bundled application, the driver and TypeFerry can be represented
by independently bundled BSON constructors whose class names are rewritten.
Checking `constructor.name === 'ObjectId'` therefore rejected a valid stored
identifier during live snapshot projection.

## Decision

Recognize live-publication ObjectIds through BSON's stable `_bsontype` value
and required `toHexString` operation. Continue accepting only string, number,
or BSON-branded ObjectId source identifiers and preserve the existing typed
ObjectId wire representation.

## Rejected alternatives

- `instanceof ObjectId` was rejected because constructor identity differs
  across duplicated or independently bundled BSON modules.
- Constructor names were rejected because bundlers may rename class bindings.
- Accepting any object with `toHexString` was rejected because it would discard
  BSON's explicit type discriminator.

## Consequences

- Live snapshots and change notices work across valid duplicated BSON module
  instances and minified server bundles.
- The public API and wire protocol do not change.
- Regression coverage must include an ObjectId-shaped value whose constructor
  is not the local driver's `ObjectId` class.
