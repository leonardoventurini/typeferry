# TypeFerry Go

The Go server implementation is in progress. `ejson` implements ordered
TypeFerry values, `runtime` handles typed method execution, and
`httptransport` mounts `POST /__h` on an application-owned `net/http` server.
WebSocket, events, Redis, and auth helpers are not ready for application use.

```go
codec := ejson.NewCodec()
payload := ejson.Object(ejson.Field{Key: "message", Value: ejson.String("hello")})
encoded, err := codec.Stringify(payload, false)
```

Object field order is retained in ordinary encoding. Pass `true` to
`Stringify` when the protocol explicitly requests canonical sorted keys.
Custom types must be registered on a `Codec` before parsing their tag.
The current HTTP adapter passes every shared HTTP fixture and calls through
the unchanged TypeScript `ClientHttp` implementation.

Run `go test ./...`, `go test -race ./...`, and `go vet ./...` in this
directory. See [the parity specification](../specs/2026-09-29-go-server-parity.md)
for the remaining work and acceptance gates.
