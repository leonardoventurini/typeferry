"""``@schema`` — attach a validator that runs before the method handler.

Accepts either a Pydantic model class or any object implementing the
:class:`~bifrost.server.schema.SchemaValidator` protocol. A raw
Pydantic model is wrapped automatically.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from bifrost.decorators.metadata import get_method_metadata
from bifrost.server.schema import PydanticValidator, SchemaValidator


def schema(validator: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator attaching a schema validator.

    .. code-block:: python

        @schema(MyPydanticModel)
        async def create(self, node, params): ...

        # Or with a custom validator implementation:
        @schema(my_custom_validator)
        async def update(self, node, params): ...
    """

    if isinstance(validator, SchemaValidator):
        resolved: SchemaValidator = validator
    elif isinstance(validator, type):
        # Assume Pydantic model class; PydanticValidator's own import
        # surface will raise a helpful error if pydantic isn't installed.
        resolved = PydanticValidator(validator)
    else:
        raise TypeError(
            "@schema expects a SchemaValidator or Pydantic BaseModel subclass"
        )

    def _decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        metadata = get_method_metadata(fn)
        metadata.schema = resolved
        return fn

    return _decorator
