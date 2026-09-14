from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

DeliveryStatus = Literal["sent", "failed", "skipped"]


@dataclass(frozen=True)
class OutboundEmail:
    to: tuple[str, ...]
    subject: str
    text_body: str
    html_body: str | None = None
    reply_to: str | None = None

    def __post_init__(self) -> None:
        if not self.to:
            raise ValueError("OutboundEmail requires at least one recipient")
        for recipient in self.to:
            _require_safe_header(recipient, "recipient")
        _require_safe_header(self.subject, "subject")
        if self.reply_to is not None:
            _require_safe_header(self.reply_to, "reply_to")


@dataclass(frozen=True)
class DeliveryResult:
    status: DeliveryStatus
    provider_message_id: str | None = None
    error_code: str | None = None

    @classmethod
    def sent(cls, provider_message_id: str | None = None) -> DeliveryResult:
        return cls(status="sent", provider_message_id=provider_message_id)

    @classmethod
    def failed(cls, error_code: str) -> DeliveryResult:
        return cls(status="failed", error_code=error_code)

    @classmethod
    def skipped(cls) -> DeliveryResult:
        return cls(status="skipped")


def _require_safe_header(value: str, field_name: str) -> None:
    if not value.strip():
        raise ValueError(f"{field_name} must not be empty")
    if "\r" in value or "\n" in value:
        raise ValueError(f"{field_name} must not contain a newline")
