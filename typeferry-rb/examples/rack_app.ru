# frozen_string_literal: true

require "typeferry"
require "typeferry/transports/rack_http"
require "typeferry/transports/rack_websocket"

server = TypeFerry::Server.new
server.set_auth(
  auth: ->(_node, context) { (context["token"] == "good-token") ? {"user" => {"_id" => "u1"}} : false },
  log_in: ->(_node, _params) { true }
)
server.add_method("echo") { |_node, params| params }
server.add_method("add") { |_node, params| Integer(params.fetch("a")) + Integer(params.fetch("b")) }
server.add_method("whoami", protected: true) { |node, _params| node.user_id }
ping = server.add_event("ping.tick")
server.add_method("emit_ping") do |_node, params|
  ping.emit(params.fetch("channel"), params["params"])
  true
end

http = TypeFerry::Transports::RackHTTP.new(server, rate_limit: nil)
websocket = TypeFerry::Transports::RackWebSocket.new(server)

at_exit do
  websocket.close
  server.close
end

run lambda { |environment|
  (environment["PATH_INFO"] == TypeFerry::Protocol::WEBSOCKET_PATH) ? websocket.call(environment) : http.call(environment)
}
