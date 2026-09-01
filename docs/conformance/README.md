# TypeFerry Conformance Fixtures

This directory is the single normative contract every implementation
tracks:

- `typeferry-ts/` (TypeScript, reference)
- `typeferry-py/` (Python port)
- `typeferry-rs/` (Rust port)

Each fixture is a frozen wire-contract point. An implementation is
conformant iff every fixture produces the expected output using only
the public wire surface described in `PROTOCOL.md`.

When `PROTOCOL.md` and a fixture disagree, the fixture wins — fixtures
are executable and mechanically enforced; prose isn't.

## Layout

```
docs/conformance/
├── README.md                 — this file
└── fixtures/
    ├── ejson/                — EJSON encode/decode pairs
    │   ├── *.case.json       — one case per file
    │   └── ...
    ├── http/                 — HTTP POST /__h pairs
    │   ├── *.case.json
    │   └── ...
    ├── ws/                   — WebSocket frame sequences
    │   ├── *.seq.ndjson
    │   └── ...
    └── redis/                — Redis pub/sub envelopes
        └── *.case.json
```

## Fixture formats

### `fixtures/ejson/*.case.json`

EJSON round-trip cases. Each file has:

```json
{
  "name": "human description",
  "value": {"__kind": "...", "...": ...},
  "encoded": "<exact JSON.stringify output>"
}
```

`value` is a tagged Rust/Python/TS-neutral representation of the
native value:

| `__kind`      | fields                                      |
|---------------|---------------------------------------------|
| `null`        | _(none)_                                    |
| `bool`        | `value: bool`                               |
| `int`         | `value: int`                                |
| `float`       | `value: number`                             |
| `string`      | `value: str`                                |
| `array`       | `items: [value, ...]`                       |
| `object`      | `entries: [[key, value], ...]` (order-sensitive) |
| `date`        | `millis: int`                               |
| `binary`      | `base64: str`                               |
| `regex`       | `source: str`, `flags: str`                 |
| `inf_nan`     | `sign: 0 \| 1 \| -1`                        |
| `custom`      | `type: str`, `inner: value`                 |

Object entries use an ordered array so fixtures that exercise
JavaScript insertion-order semantics can be expressed precisely.

### `fixtures/http/*.case.json`

Request/response fixture for `POST /__h`. Wire strings only:

```json
{
  "name": "human description",
  "request": {
    "headers": {"content-type": "text/plain", "x-api-key": "Bearer tok"},
    "body": "<exact EJSON-text body>"
  },
  "response": {
    "status": 200,
    "body": "<exact EJSON-text body, or empty string for void>"
  },
  "context": { ... optional context to prime on the server ... }
}
```

`context` is an implementation-side hint — the server test runner uses
it to register the methods/events/auth that the case requires. Runners
that can't express a hint MUST skip the case rather than falsify it.

### `fixtures/ws/*.seq.ndjson`

One JSON object per line. The first line MUST be a `connect`
directive; subsequent lines interleave client→server sends with
expected server→client frames:

```
{"op":"connect","query":{"uuid":"c1","token":"..."}}
{"op":"expect_server_frame","frame":{"t":"auth","authenticated":true}}
{"op":"send","frame":{"t":"rpc","id":"r1","method":"ping"}}
{"op":"expect_server_frame","frame":{"t":"rpc:res","id":"r1","result":"pong"}}
{"op":"disconnect"}
```

`expect_server_frame` matches the next server frame by equality
(implementations MAY ignore server-emitted ping frames while
matching).

### `fixtures/redis/*.case.json`

Redis pub/sub envelope fixtures:

```json
{
  "name": "human description",
  "publish": {
    "channel": "events",
    "payload": "<exact EJSON-text redis message body>"
  },
  "expected": {
    "event": "string",
    "channel": "string",
    "message": "<exact inner event frame>",
    "exclude_uuid": null
  }
}
```

## Versioning

Fixtures are revisioned alongside `PROTOCOL.md`. A breaking change to
a fixture body requires a new `PROTOCOL.md` revision and coordinated
changes across all implementations.
