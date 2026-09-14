from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from .schemas import DeliveryResult, OutboundEmail
from .service import EmailDeliveryError


class SmtpEmailGateway:
    name = "smtp"

    def __init__(
        self,
        *,
        host: str,
        port: int,
        from_address: str,
        from_name: str,
        username: str | None,
        password: str | None,
        starttls: bool,
        timeout_seconds: float,
    ) -> None:
        self._host = host
        self._port = port
        self._from_address = from_address
        self._from_name = from_name
        self._username = username
        self._password = password
        self._starttls = starttls
        self._timeout_seconds = timeout_seconds

    def send(self, message: OutboundEmail) -> DeliveryResult:
        email_message = self._build_message(message)
        try:
            with smtplib.SMTP(
                self._host,
                self._port,
                timeout=self._timeout_seconds,
            ) as client:
                client.ehlo()
                if self._starttls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                if self._username is not None and self._password is not None:
                    client.login(self._username, self._password)
                refused = client.send_message(
                    email_message,
                    from_addr=self._from_address,
                    to_addrs=list(message.to),
                )
                if refused:
                    raise EmailDeliveryError("smtp_recipients_refused")
        except EmailDeliveryError:
            raise
        except smtplib.SMTPAuthenticationError as error:
            raise EmailDeliveryError("smtp_authentication_failed") from error
        except smtplib.SMTPRecipientsRefused as error:
            raise EmailDeliveryError("smtp_recipients_refused") from error
        except (TimeoutError, smtplib.SMTPServerDisconnected) as error:
            raise EmailDeliveryError("smtp_timeout") from error
        except (OSError, smtplib.SMTPException) as error:
            raise EmailDeliveryError("smtp_unavailable") from error

        return DeliveryResult.sent(email_message["Message-ID"])

    def _build_message(self, message: OutboundEmail) -> EmailMessage:
        email_message = EmailMessage()
        email_message["Subject"] = message.subject
        email_message["From"] = formataddr((self._from_name, self._from_address))
        email_message["To"] = ", ".join(message.to)
        if message.reply_to is not None:
            email_message["Reply-To"] = message.reply_to
        message_id_domain = self._from_address.rpartition("@")[2] or None
        email_message["Message-ID"] = make_msgid(domain=message_id_domain)
        email_message.set_content(message.text_body)
        if message.html_body is not None:
            email_message.add_alternative(message.html_body, subtype="html")
        return email_message
