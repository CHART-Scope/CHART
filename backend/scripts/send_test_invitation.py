"""Send one rendered invitation email through the configured gateway.

Useful for eyeballing the invitation template against Mailpit locally, or for
verifying that a real SMTP provider (Gmail, SES, etc.) accepts the message.
The script does not touch the database and does not create a workspace member
row — it exists purely to exercise the email pipeline.

Usage examples:

    # Against local Mailpit (see infra/docker-compose.yml)
    EMAIL_MODE=smtp \\
    EMAIL_FROM_ADDRESS=no-reply@chart.local \\
    EMAIL_SMTP_HOST=127.0.0.1 \\
    EMAIL_SMTP_PORT=1025 \\
    EMAIL_SMTP_STARTTLS=false \\
      python backend/scripts/send_test_invitation.py --to you@example.com

    # Against Gmail with an app-specific password
    EMAIL_MODE=smtp \\
    EMAIL_FROM_ADDRESS=you@gmail.com \\
    EMAIL_SMTP_HOST=smtp.gmail.com \\
    EMAIL_SMTP_PORT=587 \\
    EMAIL_SMTP_STARTTLS=true \\
    EMAIL_SMTP_USERNAME=you@gmail.com \\
    EMAIL_SMTP_PASSWORD='<gmail-app-password>' \\
      python backend/scripts/send_test_invitation.py --to friend@example.com
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

from chart.email.service import (
    EmailConfigurationError,
    EmailDeliveryError,
    build_email_service,
)
from chart.email.templates import InvitationEmail, build_invitation_email


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--to", required=True, help="Recipient email address.")
    parser.add_argument("--recipient-name", default="Alex Sample")
    parser.add_argument("--inviter-name", default="CHART Test Runner")
    parser.add_argument("--geography-name", default="Madhya Pradesh")
    parser.add_argument("--role-name", default="Health planning lead")
    parser.add_argument(
        "--activation-url",
        default="https://chart.local/invites/preview-token/accept",
        help="Absolute http/https URL that would activate the account.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    start = date.today()
    end = start + timedelta(days=180)
    invitation = InvitationEmail(
        recipient_email=args.to,
        recipient_name=args.recipient_name,
        inviter_name=args.inviter_name,
        geography_name=args.geography_name,
        role_name=args.role_name,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        activation_url=args.activation_url,
    )
    message = build_invitation_email(invitation)

    try:
        service = build_email_service()
    except EmailConfigurationError as error:
        print(f"Email configuration error: {error}", file=sys.stderr)
        return 2

    if service.gateway_name == "disabled":
        print(
            "EMAIL_MODE is 'disabled'. Set EMAIL_MODE=smtp and the EMAIL_SMTP_* "
            "variables described in backend/.env.example, then re-run.",
            file=sys.stderr,
        )
        return 2

    try:
        result = service.send(message)
    except EmailDeliveryError as error:
        print(f"Email delivery failed: {error.code}", file=sys.stderr)
        return 1

    print(f"Sent via {service.gateway_name} to {args.to} — status={result.status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
