"""Protocol constants — verbatim port of ``bifrost-ts/src/utils/constants.ts``.

String values MUST match the TS enum values exactly. See PROTOCOL.md §12.
"""

from __future__ import annotations

from enum import Enum

HTTP_ENDPOINT_PATH = "/__h"
BIFROST_WS_PATH = "/bifrost-ws"

NO_CHANNEL = "NO_CHANNEL"

CLIENT_ID_HEADER_KEY = "x-client-id"
TOKEN_HEADER_KEY = "x-api-key"


class BifrostEvents(str, Enum):
    METHOD_REFRESH = "bifrost:method:refresh"
    SERVER_SENT_EVENTS_CONNECTED = "server:sent:events:connected"
    COMMIT_PENDING_SUBSCRIPTIONS = "commit:pending:subscriptions"
    COMMIT_PENDING_UNSUBSCRIPTIONS = "commit:pending:unsubscriptions"


class WebSocketEvents(str, Enum):
    OPEN = "open"
    MESSAGE = "message"
    CONNECTION = "connection"
    CLOSE = "close"
    ERROR = "error"
    CONNECT = "connect"
    DISCONNECT = "disconnect"


class ServerEvents(str, Enum):
    AUTHENTICATION = "authentication"
    LOGOUT = "logout"
    UPGRADE = "upgrade"
    REQUEST = "request"
    HTTP_LISTENING = "http:listening"
    WEBSOCKET_LISTENING = "websocket:listening"
    CONNECTION = "connection"
    DISCONNECTION = "disconnection"
    DISCONNECT = "disconnect"
    SOCKET_ERROR = "socket:error"
    ERROR = "error"
    REDIS_CONNECT = "redis:connect"
    READY = "ready"
    METHOD_EXECUTION = "method:execution"
    METHOD_ERROR = "method:error"
    CLOSED = "closed"
    USER_DISCONNECTED = "user:disconnected"


class ClientEvents(str, Enum):
    LOGOUT = "auth:logout"
    ERROR = "error"
    INITIALIZING = "initializing"
    INITIALIZED = "initialized"
    INITIALIZATION_FAILED = "initialization:failed"
    INITIALIZATION_RETRY = "initialization:retry"
    CONTEXT_CHANGED = "context:changed"
    OUTBOUND_MESSAGE = "outbound:message"
    INBOUND_MESSAGE = "inbound:message"
    CONNECTING = "connecting"
    WEBSOCKET_CONNECTED = "websocket:connected"
    WEBSOCKET_CLOSED = "websocket:closed"
    WEBSOCKET_RECONNECTING = "websocket:reconnecting"
    CLOSE = "client:close"


class RedisListeners(str, Enum):
    CONNECT = "connect"
    EVENTS = "events"
    MESSAGE = "message"


class Methods(str, Enum):
    RPC_LOGIN = "rpc:login"
    RPC_LOGOUT = "rpc:logout"
    RPC_ON = "rpc:on"
    RPC_OFF = "rpc:off"
    LIST_METHODS = "list:methods"


class WebSocketState:
    """Mirrors the TS ``WebSocketState`` object (not an Enum in TS)."""

    CONNECTING = 0
    OPEN = 1
    CLOSING = 2
    CLOSED = 3
