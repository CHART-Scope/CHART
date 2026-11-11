# Sign-in and email

People sign in without passwords: they type their email address, Keycloak
emails them a six-character code, and the code signs them in. The one
exception is the default administrator, `admin`, which has a password and
must change it at its first sign-in
([installation setup](installation-setup.md)). Anyone can use
[Explore](explore.md) without an account; signing in is for people an
administrator has added (the first administrator is created by the
[installation wizard](installation-setup.md)).

## How it works

`infra/keycloak/sync-realm.js` (run by `make identity-sync` and by every
deploy) sets the `chart` realm up:

- the browser flow **chart email code**: an existing session, or the email
  address followed by a code sent to it;
- codes are 6 characters, last 10 minutes, can be resent after 60 seconds,
  and at most `SIGN_IN_CODE_LIMIT` (default 5) are sent to one person in
  15 minutes, so nobody can flood an inbox;
- self-registration and password reset are off. An unknown or disabled
  address gets an error and no email;
- Keycloak sends the email itself through the SMTP server below;
- after the code, CHART opens the dashboard of the person's own area (the
  area the Planning center would pick; for Kenya, Kajiado), or the page that
  asked them to sign in.

The two screens, **CHART login** (email) and **Check your email** (code),
use CHART's fonts and colours. On screens 960px and wider they follow the
design's sign-in frame: a charcoal panel on the left with the wordmark,
"Plan for climate-health risk, together." and the three steps, and the form
on its right. Narrower screens keep the bar and a full-width form. The email
step also offers **Explore the map without an account** and says that an
administrator adds accounts. They are the `chart` login theme:
`infra/keycloak/themes/chart/login/` holds their templates
(`login-username.ftl`, `login-email-otp.ftl`, and `footer.ftl` for the brand
panel), wording (`messages/messages_en.properties`) and styles
(`resources/css/chart.css`).

Keycloak serves theme files under a path that changes only with the
Keycloak version, and browsers keep them for 30 days. So `theme.properties`
names the stylesheet as `css/chart.css?v=<date>`. **Change that date
whenever `chart.css` changes**; otherwise people who have signed in before
keep the old styles next to the new templates.

The code step is the
[for-keycloak email OTP authenticator](https://github.com/for-keycloak/email-otp-authenticator)
(Unlicense), committed as
`infra/keycloak/providers/email-otp-authenticator-v1.8.1-kc-26.6.4.jar`
(SHA-256 `8013758fe4f24dfb561d57f83c0853387fb18c9b35925c77fb60ccd9af7cedea`).
`infra/keycloak/Dockerfile` builds it, the theme and the realm seed into the
`chart-keycloak` image that deployments run (pre-built, so Keycloak starts in
seconds), and the sync script into `chart-keycloak-config`. To upgrade
Keycloak, change `KEYCLOAK_VERSION` there and replace the jar with the
release built for that version.

## Email settings

Any SMTP service works; changing provider only changes these settings. In
production they go in `~/chart-deploy/aws/.env.prod`. The deploy stops before
changing anything if `SMTP_HOST` or `SMTP_FROM` is missing, because without
mail nobody could sign in.

| Setting | Meaning | Default |
| --- | --- | --- |
| `SMTP_HOST` | SMTP server | required |
| `SMTP_PORT` | Port | `587` |
| `SMTP_SECURITY` | `starttls`, `ssl` or `none` (local Mailpit only) | `starttls` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Credentials, set together | none |
| `SMTP_FROM` | Sender address, on a domain you have verified | required |
| `SMTP_FROM_NAME` | Sender name | `CHART` |
| `SMTP_REPLY_TO` | Reply-to address | none |
| `SIGN_IN_CODE_LIMIT` | Codes per person per 15 minutes (0 turns the cap off) | `5` |

### Amazon SES (recommended on AWS)

```dotenv
SMTP_HOST=email-smtp.eu-north-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=<SES SMTP username>
SMTP_PASSWORD=<SES SMTP password>
SMTP_FROM=no-reply@chartforclimateaction.org
```

1. In SES (same region as the server), create a domain identity for
   `chartforclimateaction.org`. With the domain in Route 53, SES adds the three
   DKIM records for you.
2. Set a custom MAIL FROM domain, `mail.chartforclimateaction.org`, and add the
   MX and SPF records SES shows.
3. Add DMARC: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:<a monitored inbox>`.
   Tighten to `p=quarantine` once reports look clean.
4. Request production access. A sandboxed SES account only delivers to
   verified addresses.
5. Create SMTP credentials (SES → SMTP settings). They are not your AWS
   access keys.

### Other providers

The same settings work with any SMTP service, for example:

| Provider | `SMTP_HOST` | `SMTP_PORT` | Username |
| --- | --- | --- | --- |
| Resend | `smtp.resend.com` | `587` | `resend` (password: API key) |
| Postmark | `smtp.postmarkapp.com` | `587` | server token (password: same) |
| Google Workspace SMTP relay | `smtp-relay.gmail.com` | `587` | per relay settings |

Verify the sending domain with the provider and publish its SPF and DKIM
records, or codes will land in spam. Running your own mail server is not
recommended: AWS blocks outbound port 25 by default and a new server IP has
no sending reputation.

### Local development and E2E

`make identity-sync` points Keycloak at Mailpit with no credentials. Read the
codes at `http://127.0.0.1:8025` (also through the remote-dev tunnel). The
live E2E suite (`make e2e-outlook`) runs its own Mailpit and reads each code
through Mailpit's API, so browser tests sign in exactly as people do.

## Test the email settings

After a deploy (or `make identity-sync`), send a test message from Keycloak:
admin console (`/identity` in production, `http://127.0.0.1:8080` locally) →
realm `chart` → **Realm settings** → **Email** → **Test connection**. The test
goes to the signed-in Keycloak administrator's email address, so give that
account an address first. Then sign in to CHART with a real account and check
the code arrives within a minute and is not in spam.

## Inviting people

An administrator invites people in **Settings → Workspace**: full name, email
address, role and planning area (a country or its first level, such as a
state or county; an area covers everything inside it).

1. CHART creates the account, with no password (`POST /users`).
2. Keycloak emails **You are invited to CHART** through the email settings
   above. The link works for 7 days.
3. The link opens **Accept your CHART invitation**; accepting confirms the
   address and offers **Go to CHART login**.
4. They sign in with their email address and a code, and land on their
   area's dashboard.

If the email could not be sent, the account still exists and Settings says
so. **Send invitation again** beside a person emails a fresh link
(`POST /users/{id}/invitation`). An address that already has an account is
refused. The emails use CHART's layout and wording: the `chart` email theme
in `infra/keycloak/themes/chart/email/`.

## Administrators

- Disabling a person (`POST /users/{id}/disable`) stops their codes.
- The Keycloak administration console (`/identity/admin`) is for operators,
  not everyday work. Its sign-in, headed **CHART admin**, also uses CHART's look; the user is `admin`
  and the password is `KEYCLOAK_ADMIN_PASSWORD` from `.env.prod`. That is
  Keycloak's own administrator, a different account from CHART's `admin`.
- If the only administrator is locked out, re-enable them from an operator
  shell; they then sign in with a code as usual:

  ```bash
  chart-admin-recover --username <name> --email <address> --confirm <name>
  ```

## Troubleshooting

- **No code arrives:** check spam, then the Keycloak log
  (`docker logs chart-keycloak`) for SMTP errors, and the provider's sending
  dashboard. SES in sandbox mode drops mail to unverified addresses.
- **"Too many codes have been requested":** the person hit
  `SIGN_IN_CODE_LIMIT`; it clears within 15 minutes.
- **The deploy stops at "set SMTP_HOST in .env.prod":** add the email
  settings above to `.env.prod`.
