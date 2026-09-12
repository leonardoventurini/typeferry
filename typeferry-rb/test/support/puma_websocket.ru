# frozen_string_literal: true

root = File.expand_path("../..", __dir__)
$LOAD_PATH.unshift(File.join(root, "lib"))

require "typeferry"
require "typeferry/transports/rack_websocket"

server = TypeFerry::Server.new
server.add_method("echo", ->(_node, params) { params })
changed = server.add_event("changed")
server.add_method("blast", ->(_node, params) {
  workers = params.fetch("count").times.map do |index|
    Thread.new { changed.emit("room", {"index" => index}) }
  end
  workers.each(&:join)
  workers.length
})

run TypeFerry::Transports::RackWebSocket.new(server, origins: ["https://studio.test"])
