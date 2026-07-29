from __future__ import annotations

import logging
import smtplib
from unittest.mock import MagicMock, patch

import pytest

from chart.email import (
    DeliveryResult,
    EmailConfigurationError,
    EmailDeliveryError,
    EmailService,
    EmailSettings,
    OutboundEmail,
    build_email_service,
)
from chart.email.smtp import SmtpEmailGateway


class SuccessfulGateway:
    name = "fake"

    def send(self, _message: OutboundEmail) -> DeliveryResult:
        return DeliveryResult.sent("provider-id")


class FailingGateway:
    name = "fake"

    def send(self, _message: OutboundEmail) -> DeliveryResult:
        raise EmailDeliveryError("fake_unavailable")


def _message() -> OutboundEmail:
    return OutboundEmail(
        to=("planner@example.org",),
        subject="Your CHART workspace is ready",
        text_body="Open CHART to continue.",
        html_body="<p>Open CHART to continue.</p>",
        reply_to="support@example.org",
    )


def _smtp_gateway() -> SmtpEmailGateway:
    return SmtpEmailGateway(
        host="smtp.example.org",
        port=587,
        from_address="no-reply@example.org",
        from_name="CHART",
        username="smtp-user",
        password="smtp-password",
        starttls=True,
        timeout_seconds=5.0,
    )


def test_outbound_email_requires_a_recipient() -> None:
    with pytest.raises(ValueError, match="at least one recipient"):
        OutboundEmail(to=(), subject="Subject", text_body="Body")


def test_outbound_email_rejects_header_newlines() -> None:
    with pytest.raises(ValueError, match="subject must not contain a newline"):
        OutboundEmail(
            to=("planner@example.org",),
            subject="Subject\nBcc: other@example.org",
            text_body="Body",
        )


def test_email_is_disabled_by_default() -> None:
    service = build_email_service(EmailSettings.from_environment({}))

    assert service.gateway_name == "disabled"
    assert service.send_best_effort(_message()).status == "skipped"


def test_smtp_configuration_requires_host_and_sender() -> None:
    with pytest.raises(
        EmailConfigurationError,
        match="EMAIL_FROM_ADDRESS, EMAIL_SMTP_HOST",
    ):
        build_email_service(EmailSettings(mode="smtp"))


def test_smtp_credentials_must_be_configured_together() -> None:
    settings = EmailSettings(
        mode="smtp",
        from_address="no-reply@example.org",
        smtp_host="smtp.example.org",
        smtp_username="smtp-user",
    )

    with pytest.raises(EmailConfigurationError, match="must be set together"):
        build_email_service(settings)


def test_environment_settings_parse_smtp_values() -> None:
    settings = EmailSettings.from_environment(
        {
            "EMAIL_MODE": "smtp",
            "EMAIL_FROM_ADDRESS": "no-reply@example.org",
            "EMAIL_FROM_NAME": "CHART Notifications",
            "EMAIL_SMTP_HOST": "smtp.example.org",
            "EMAIL_SMTP_PORT": "2525",
            "EMAIL_SMTP_USERNAME": "smtp-user",
            "EMAIL_SMTP_PASSWORD": "smtp-password",
            "EMAIL_SMTP_STARTTLS": "false",
            "EMAIL_SMTP_TIMEOUT_SECONDS": "2.5",
        }
    )

    assert settings == EmailSettings(
        mode="smtp",
        from_address="no-reply@example.org",
        from_name="CHART Notifications",
        smtp_host="smtp.example.org",
        smtp_port=2525,
        smtp_username="smtp-user",
        smtp_password="smtp-password",
        smtp_starttls=False,
        smtp_timeout_seconds=2.5,
    )


def test_environment_settings_reject_invalid_values() -> None:
    with pytest.raises(EmailConfigurationError, match="EMAIL_MODE"):
        EmailSettings.from_environment({"EMAIL_MODE": "ses"})
    with pytest.raises(EmailConfigurationError, match="EMAIL_SMTP_STARTTLS"):
        EmailSettings.from_environment({"EMAIL_SMTP_STARTTLS": "sometimes"})


def test_email_service_exposes_success() -> None:
    result = EmailService(SuccessfulGateway()).send(_message())

    assert result == DeliveryResult.sent("provider-id")


def test_best_effort_failure_is_logged_without_recipient(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING, logger="chart.email.service"):
        result = EmailService(FailingGateway()).send_best_effort(_message())

    assert result == DeliveryResult.failed("fake_unavailable")
    record = caplog.records[0]
    assert record.email_error_code == "fake_unavailable"
    assert record.email_gateway == "fake"
    assert record.email_recipient_count == 1
    assert "planner@example.org" not in record.getMessage()


def test_smtp_gateway_builds_and_sends_multipart_email() -> None:
    connection = MagicMock()
    client = connection.__enter__.return_value
    client.send_message.return_value = {}
    tls_context = MagicMock()

    with (
        patch("chart.email.smtp.smtplib.SMTP", return_value=connection) as smtp,
        patch(
            "chart.email.smtp.ssl.create_default_context",
            return_value=tls_context,
        ),
    ):
        result = _smtp_gateway().send(_message())

    smtp.assert_called_once_with("smtp.example.org", 587, timeout=5.0)
    client.starttls.assert_called_once_with(context=tls_context)
    client.login.assert_called_once_with("smtp-user", "smtp-password")
    sent_message = client.send_message.call_args.args[0]
    assert sent_message["Subject"] == "Your CHART workspace is ready"
    assert sent_message["From"] == "CHART <no-reply@example.org>"
    assert sent_message["To"] == "planner@example.org"
    assert sent_message["Reply-To"] == "support@example.org"
    assert sent_message.get_body(preferencelist=("plain",)).get_content().strip() == (
        "Open CHART to continue."
    )
    assert sent_message.get_body(preferencelist=("html",)).get_content().strip() == (
        "<p>Open CHART to continue.</p>"
    )
    assert result == DeliveryResult.sent(sent_message["Message-ID"])


def test_smtp_gateway_classifies_authentication_failure() -> None:
    connection = MagicMock()
    client = connection.__enter__.return_value
    client.login.side_effect = smtplib.SMTPAuthenticationError(535, b"invalid")

    with patch("chart.email.smtp.smtplib.SMTP", return_value=connection):
        with pytest.raises(EmailDeliveryError) as raised:
            _smtp_gateway().send(_message())

    assert raised.value.code == "smtp_authentication_failed"
