"""Server runtime: Server, ClientNode, Method, Event, ServerChannel, RoomRegistry.

Mirrors ``typeferry-ts/src/server/*``.
"""

from typeferry.server.client_node import ClientNode, ClientNodeContext
from typeferry.server.context import TypeFerryContext
from typeferry.server.event import Event, EventOptions
from typeferry.server.method import Method, MethodOptions
from typeferry.server.room_registry import RoomRegistry
from typeferry.server.schema import (
    PydanticValidator,
    SchemaValidator,
    ValidationIssue,
    ValidationResult,
)
from typeferry.server.server import AuthSetup, Server, ServerOptions, create_server
from typeferry.server.server_channel import ServerChannel
from typeferry.server.socket import SocketState, TypeFerrySocket

__all__ = [
    "AuthSetup",
    "ClientNode",
    "ClientNodeContext",
    "Event",
    "EventOptions",
    "Method",
    "MethodOptions",
    "PydanticValidator",
    "RoomRegistry",
    "SchemaValidator",
    "Server",
    "ServerChannel",
    "ServerOptions",
    "SocketState",
    "TypeFerryContext",
    "TypeFerrySocket",
    "ValidationIssue",
    "ValidationResult",
    "create_server",
]
