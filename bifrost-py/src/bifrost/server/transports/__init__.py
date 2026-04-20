"""Transport implementations — HTTP, WebSocket, and Redis.

Concrete transports are optional; import the one you need via the
matching extras:

* ``pip install 'example-app-bifrost[http]'`` → :mod:`bifrost.server.transports.http`
* ``pip install 'example-app-bifrost[ws]'``   → :mod:`bifrost.server.transports.websocket`
* ``pip install 'example-app-bifrost[redis]'`` → :mod:`bifrost.server.transports.redis`
"""
