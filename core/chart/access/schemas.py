from __future__ import annotations

from pydantic import BaseModel


class AccessCheck(BaseModel):
    allowed: bool
    code: str | None = None
