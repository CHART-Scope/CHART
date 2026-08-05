# AWS sandbox deployment

The `App Deploy` GitHub Actions workflow provisions one EC2 host with the web
app, Python API, Dagster, Postgres, Keycloak, and nginx. The operational
runbook lives in
[`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md).
This page covers the parts most likely to trip up a first-time deploy: choosing
a scheme for the public origin and the Keycloak coupling that follows from it.

## Public origin

`AWS_APP_PUBLIC_ORIGIN` is the canonical URL browsers hit. Every downstream
setting — the `chart-web` Keycloak client's redirect URIs, `CHART_WEB_ORIGIN`,
`KEYCLOAK_ISSUER_URL`, CORS allowlist — is derived from it. Set it to the
domain, not an EC2 IP; the wider Keycloak notes at
[`infra/keycloak/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/keycloak/README.md)
explain why using the IP breaks OIDC callbacks.

## HTTPS (the default)

For any deploy that real users touch, pick one:

- **nginx on the box terminates TLS.** Provide `CHART_TLS_CERT_FILE` and
  `CHART_TLS_KEY_FILE` as GitHub Actions secrets, pointing to cert files that
  the deploy has already staged on the host (Let's Encrypt via certbot is
  fine for a sandbox). Open port 443 on the security group.
- **A load balancer in front terminates TLS.** Put an ALB with an ACM cert in
  front of the EC2 host, target group on port 80. Set
  `CHART_TLS_TERMINATED_UPSTREAM=1`.

Either path leaves `AWS_APP_PUBLIC_ORIGIN=https://<domain>` and Keycloak
enforcing `sslRequired=external`, which is what
`infra/keycloak/chart-realm.json` ships.

## HTTP sandbox

If a sandbox has no TLS yet and you need to keep clicking through it, set
`ALLOW_INSECURE_HTTP=1` and use an `http://` public origin. The deploy detects
the HTTP scheme and re-applies `sslRequired=none` on the realm so the Keycloak
login flow does not reject the browser with "HTTPS required". The coupling is
re-applied on every deploy, so as soon as the sandbox gains a certificate and
flips back to `https://`, `sslRequired` returns to `external` without any
manual `kcadm` intervention.

Do not do this for anything other than an isolated sandbox — cleartext HTTP
exposes access tokens and passwords over the network.

## Related

- [`infra/aws/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/README.md)
  — required secrets, EC2 requirements, container health checks.
- [`infra/keycloak/README.md`](https://github.com/CHART-Scope/CHART/blob/dev/infra/keycloak/README.md)
  — upstream SSO configuration and callback URL rules.
- [`infra/aws/deploy-app.sh`](https://github.com/CHART-Scope/CHART/blob/dev/infra/aws/deploy-app.sh)
  — the deploy script that reads every environment variable above.
