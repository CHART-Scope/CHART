from __future__ import annotations

from dataclasses import dataclass
from html import escape
from textwrap import dedent
from urllib.parse import urlsplit

from .schemas import OutboundEmail


@dataclass(frozen=True)
class InvitationEmail:
    recipient_email: str
    recipient_name: str
    inviter_name: str
    geography_name: str
    role_name: str
    start_date: str
    end_date: str
    activation_url: str


def build_invitation_email(invitation: InvitationEmail) -> OutboundEmail:
    _require_web_url(invitation.activation_url)
    subject = f"You've been invited to CHART by {invitation.inviter_name}"
    text_body = dedent(
        f"""
        Hello {invitation.recipient_name},

        You've been invited by {invitation.inviter_name} to join CHART—the Climate
        & Health Adaptation and Resilience Tool—and support climate and health
        planning in {invitation.geography_name}.

        Your role
        {invitation.role_name}

        Engagement period
        {invitation.start_date} — {invitation.end_date}

        Activate your account:
        {invitation.activation_url}

        Use the organisational account associated with this invitation.

        Welcome aboard,
        The CHART team
        """
    ).strip()
    values = {
        field: escape(str(value), quote=True)
        for field, value in invitation.__dict__.items()
    }
    html_body = f"""\
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f7f5f3;color:#2b2d31;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                 style="max-width:600px;background:#ffffff;border:1px solid #d4d2ce">
            <tr>
              <td style="padding:32px">
                <div style="margin-bottom:24px;color:#55111f;font-size:16px;
                            font-weight:700;letter-spacing:0.08em">CHART</div>
                <p>Hello {values["recipient_name"]},</p>
                <p style="line-height:1.7">
                  You&apos;ve been invited by <strong>{values["inviter_name"]}</strong>
                  to join CHART—the Climate &amp; Health Adaptation and Resilience
                  Tool—and support climate and health planning in
                  <strong>{values["geography_name"]}</strong>.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                       style="margin:24px 0;border:1px solid #d4d2ce">
                  <tr>
                    <td style="padding:14px 16px;border-right:1px solid #d4d2ce">
                      <small style="color:#7a7872;text-transform:uppercase">Your role</small>
                      <div style="margin-top:6px">{values["role_name"]}</div>
                    </td>
                    <td style="padding:14px 16px">
                      <small style="color:#7a7872;text-transform:uppercase">
                        Engagement period
                      </small>
                      <div style="margin-top:6px">
                        {values["start_date"]} — {values["end_date"]}
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="line-height:1.7">
                  CHART gives your team a shared place to review climate evidence,
                  understand health risks and coordinate action across departments.
                </p>
                <p style="margin:28px 0">
                  <a href="{values["activation_url"]}"
                     style="display:inline-block;padding:12px 20px;border-radius:6px;
                            background:#383ee9;color:#ffffff;text-decoration:none">
                    Activate your account
                  </a>
                </p>
                <p style="color:#7a7872;font-size:13px;line-height:1.6">
                  Use the organisational account associated with this invitation.
                </p>
                <p style="margin-top:28px;color:#7a7872">
                  Welcome aboard,<br>The CHART team
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return OutboundEmail(
        to=(invitation.recipient_email,),
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def _require_web_url(value: str) -> None:
    url = urlsplit(value)
    if (
        url.scheme not in {"http", "https"}
        or not url.netloc
        or url.username
        or url.password
    ):
        raise ValueError("activation_url must be an absolute HTTP(S) URL")
