"""Transport implementations — HTTP, WebSocket, and Redis.

Concrete transports are optional; import the one you need via the
matching extras:

* ``pip install 'typeferry-py[http]'`` → :mod:`typeferry.server.transports.http`
* ``pip install 'typeferry-py[ws]'``   → :mod:`typeferry.server.transports.websocket`
* ``pip install 'typeferry-py[redis]'`` → :mod:`typeferry.server.transports.redis`
"""
