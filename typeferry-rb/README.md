# typeferry-rb

Ruby server implementation of the TypeFerry protocol. Core runtime features are
framework-neutral; HTTP uses Rack and production WebSockets use Puma's Rack 3
hijack support.

The package is under implementation and is not published to RubyGems. Use
`PROTOCOL.md` and the shared conformance fixtures at the repository root as the
wire authority.

## Development

Ruby 3.3 or newer is required.

```sh
bundle install
bundle exec rake verify
```

## Puma WebSockets

Require the Puma adapter explicitly and mount its protocol-owned path:

```ruby
require "typeferry"
require "typeferry/transports/rack_websocket"

server = TypeFerry::Server.new
websocket = TypeFerry::Transports::RackWebSocket.new(
  server,
  origins: ["https://studio.example"]
)

run websocket
```

Run the Rack application with Puma 7.2 or newer. The adapter rejects requests
before upgrading when the path or origin is invalid, and reports a clear error
when a Rack host does not implement full hijacking. It owns reader and heartbeat
threads for upgraded connections; call `websocket.close` during shutdown.

The package remains unpublished. Applications should reference this repository
and revision directly from their Gemfile.

## Redis propagation

Require `typeferry/transports/redis` explicitly, then attach and connect one
transport per server process:

```ruby
redis = TypeFerry::Transports::RedisTransport.new(server, url: ENV.fetch("REDIS_URL"))
redis.connect
```

The adapter uses a serialized publisher connection and a dedicated subscriber
connection. Lost subscriptions reconnect and resubscribe automatically. Call
`redis.close` during shutdown to stop its listener and remove the process-owned
client, user, and server registration keys.
