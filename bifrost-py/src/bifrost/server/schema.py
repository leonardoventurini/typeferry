"""Schema validation protocol and adapters.

The TS server uses Zod directly. The Python port exposes a minimal
:class:`SchemaValidator` protocol so Pydantic (the default) is
swappable without coupling the runtime to it.

Validation failures MUST produce the same envelope as the TS side:
``message`` = ``"Invalid Params: <path>: <issue>, ..."`` and
``errors`` = list of per-issue strings in ``"path: message"`` form
(PROTOCOL.md §6.4).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from pydantic import BaseModel


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    path: list[str]
    message: str

    def format(self) -> str:
        """Render as ``"path.part: message"`` matching the TS format."""

        return f"{'.'.join(self.path)}: {self.message}"


@dataclass(frozen=True, slots=True)
class ValidationResult:
    success: bool
    data: Any = None
    issues: list[ValidationIssue] = field(default_factory=list)


@runtime_checkable
class SchemaValidator(Protocol):
    """Minimal validation surface: ``safe_parse(value) -> ValidationResult``."""

    def safe_parse(self, value: Any) -> ValidationResult: ...


class PydanticValidator:
    """Adapter wrapping a Pydantic v2 ``BaseModel`` subclass.

    Constructed lazily; import errors surface at construction time, not
    import time, so the core runtime works without Pydantic installed.
    """

    def __init__(self, model: type[BaseModel]) -> None:
        self.model = model

    def safe_parse(self, value: Any) -> ValidationResult:
        try:
            from pydantic import ValidationError
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "PydanticValidator requires the 'pydantic' extra: "
                "pip install 'example-app-bifrost[schema]'"
            ) from exc

        try:
            data = self.model.model_validate(value if value is not None else {})
            return ValidationResult(success=True, data=data)
        except ValidationError as error:
            issues = [
                ValidationIssue(
                    path=[str(part) for part in err.get("loc", ())],
                    message=str(err.get("msg", "")),
                )
                for err in error.errors()
            ]
            return ValidationResult(success=False, issues=issues)
