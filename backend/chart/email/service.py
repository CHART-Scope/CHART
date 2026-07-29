from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal, Mapping, Protocol

from .schemas import DeliveryResult, OutboundEmail

logger = logging.getLogger(__name__)

EmailMode = Literal["disabled", "smtp"]


class EmailConfigurationError(ValueError):
    """Raised when email settings cannot create a usable gateway."""


class EmailDeliveryError(RuntimeError):
    """A safe, classified email transport failure."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class EmailGateway(Protocol):
    name: str

    def send(self, message: OutboundEmail) -> DeliveryResult:
        """Attempt one delivery or raise EmailDeliveryError."""


@dataclass(frozen=True)
class EmailSettings:
    mode: EmailMode = "disabled"
    from_address: str | None = None
    from_name: str = "CHART"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    smtp_timeout_seconds: float = 5.0

    @classmethod
    def from_environment(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> EmailSettings:
        values = os.environ if environ is None else environ
        mode = values.get("EMAIL_MODE", "disabled").strip().lower()
        if mode not in {"disabled", "smtp"}:
            raise EmailConfigurationError(
                "EMAIL_MODE must be one of: disabled, smtp"
            )

        return cls(
            mode=mode,
            from_address=_optional(values, "EMAIL_FROM_ADDRESS"),
            from_name=values.get("EMAIL_FROM_NAME", "CHART").strip() or "CHART",
            smtp_host=_optional(values, "EMAIL_SMTP_HOST"),
            smtp_port=_positive_int(values, "EMAIL_SMTP_PORT", 587),
            smtp_username=_optional(values, "EMAIL_SMTP_USERNAME"),
            smtp_password=values.get("EMAIL_SMTP_PASSWORD") or None,
            smtp_starttls=_boolean(values, "EMAIL_SMTP_STARTTLS", True),
            smtp_timeout_seconds=_positive_float(
                values,
                "EMAIL_SMTP_TIMEOUT_SECONDS",
                5.0,
            ),
        )


class EmailService:
    def __init__(self, gateway: EmailGateway) -> None:
        self._gateway = gateway

    @property
    def gateway_name(self) -> str:
        return self._gateway.name

    def send(self, message: OutboundEmail) -> DeliveryResult:
        """Send an email and expose a classified transport failure to the caller."""
        return self._gateway.send(message)

    def send_best_effort(self, message: OutboundEmail) -> DeliveryResult:
        """Send without allowing a transport failure to break the main workflow."""
        try:
            return self.send(message)
        except EmailDeliveryError as error:
            logger.warning(
                "Email delivery failed",
                extra={
                    "email_error_code": error.code,
                    "email_gateway": self.gateway_name,
                    "email_recipient_count": len(message.to),
                },
            )
            return DeliveryResult.failed(error.code)


class NullEmailGateway:
    name = "disabled"

    def send(self, _message: OutboundEmail) -> DeliveryResult:
        return DeliveryResult.skipped()


def build_email_service(settings: EmailSettings | None = None) -> EmailService:
    resolved = settings or EmailSettings.from_environment()
    if resolved.mode == "disabled":
        return EmailService(NullEmailGateway())

    missing = [
        variable
        for variable, value in (
            ("EMAIL_FROM_ADDRESS", resolved.from_address),
            ("EMAIL_SMTP_HOST", resolved.smtp_host),
        )
        if not value
    ]
    if missing:
        raise EmailConfigurationError(
            f"SMTP email requires: {', '.join(missing)}"
        )
    if bool(resolved.smtp_username) != bool(resolved.smtp_password):
        raise EmailConfigurationError(
            "EMAIL_SMTP_USERNAME and EMAIL_SMTP_PASSWORD must be set together"
        )

    from .smtp import SmtpEmailGateway

    gateway = SmtpEmailGateway(
        host=resolved.smtp_host,
        port=resolved.smtp_port,
        from_address=resolved.from_address,
        from_name=resolved.from_name,
        username=resolved.smtp_username,
        password=resolved.smtp_password,
        starttls=resolved.smtp_starttls,
        timeout_seconds=resolved.smtp_timeout_seconds,
    )
    return EmailService(gateway)


def _optional(values: Mapping[str, str], name: str) -> str | None:
    value = values.get(name, "").strip()
    return value or None


def _positive_int(
    values: Mapping[str, str],
    name: str,
    default: int,
) -> int:
    raw_value = values.get(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise EmailConfigurationError(f"{name} must be an integer") from error
    if value <= 0:
        raise EmailConfigurationError(f"{name} must be greater than zero")
    return value


def _positive_float(
    values: Mapping[str, str],
    name: str,
    default: float,
) -> float:
    raw_value = values.get(name, str(default)).strip()
    try:
        value = float(raw_value)
    except ValueError as error:
        raise EmailConfigurationError(f"{name} must be a number") from error
    if value <= 0:
        raise EmailConfigurationError(f"{name} must be greater than zero")
    return value


def _boolean(
    values: Mapping[str, str],
    name: str,
    default: bool,
) -> bool:
    raw_value = values.get(name)
    if raw_value is None:
        return default
    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise EmailConfigurationError(f"{name} must be true or false")
