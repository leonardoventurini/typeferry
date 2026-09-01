"""Decorators for authoring TypeFerry methods — port of
``typeferry-ts/src/server/decorators/*``.

Typical shape:

.. code-block:: python

    from typeferry.decorators import namespace, method, protected, cached, schema, register

    @namespace("users")
    class UserMethods:
        @method
        async def list(self, node, params): ...

        @protected
        @cached(max_age_ms=30_000)
        async def me(self, node, _params): ...

        @schema(MyPydanticModel)
        async def create(self, node, params): ...

    register(server, UserMethods())

Semantics match PROTOCOL.md §11: namespace prefixing, per-method
schema / protection / caching / middleware, and an imperative
registration path via ``Server.add_method`` if callers prefer to
skip decorators.
"""

from typeferry.decorators.cached import cached, no_cache
from typeferry.decorators.metadata import MethodMetadata, get_method_metadata
from typeferry.decorators.method import method
from typeferry.decorators.namespace import namespace
from typeferry.decorators.protected import protected, public
from typeferry.decorators.register import register
from typeferry.decorators.schema import schema
from typeferry.decorators.use import use

__all__ = [
    "MethodMetadata",
    "cached",
    "get_method_metadata",
    "method",
    "namespace",
    "no_cache",
    "protected",
    "public",
    "register",
    "schema",
    "use",
]
