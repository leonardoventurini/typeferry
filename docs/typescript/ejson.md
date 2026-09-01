# EJSON

TypeFerry uses Extended JSON to preserve values that ordinary JSON cannot round-trip, including dates, binary data, regular expressions, non-finite numbers, and registered custom values.

```ts
// shared/serialization.ts
import { EJSON } from 'typeferry-ts/ejson'

const encoded = EJSON.stringify({ createdAt: new Date() })
const decoded = EJSON.parse(encoded)
```

Use EJSON-compatible values at RPC and event boundaries. Do not manually add wire tags or depend on their internal object shape; use the package converter and treat [`PROTOCOL.md`](../../PROTOCOL.md) as the normative cross-language contract.

Custom types need a stable, globally unique tag and converters installed on every participating implementation. Changing a tag or representation is a protocol migration and requires updated conformance fixtures.

EJSON preserves representation, not trust. Validate decoded network data before using it in authorization, database queries, filesystem paths, or process execution.
