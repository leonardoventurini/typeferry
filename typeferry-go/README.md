# TypeFerry Go

The Go server implementation is in progress. `ejson` implements ordered
TypeFerry values, `runtime` handles typed methods and local events, and
`httptransport` and `websocket` mount `POST /__h` and `/typeferry-ws` on an
application-owned `net/http` server. Redis propagation and auth helpers are
still in progress.

```go
codec := ejson.NewCodec()
payload := ejson.Object(ejson.Field{Key: "message", Value: ejson.String("hello")})
encoded, err := codec.Stringify(payload, false)
```

Object field order is retained in ordinary encoding. Pass `true` to
`Stringify` when the protocol explicitly requests canonical sorted keys.
Custom types must be registered on a `Codec` before parsing their tag.
The HTTP and WebSocket adapters pass their shared fixtures and call through
the unchanged TypeScript client. Call `Close` on the WebSocket handler during
shutdown because `net/http.Server.Shutdown` does not own upgraded sockets.

Run `go test ./...`, `go test -race ./...`, and `go vet ./...` in this
directory. See [the parity specification](../specs/2026-09-29-go-server-parity.md)
for the remaining work and acceptance gates.
