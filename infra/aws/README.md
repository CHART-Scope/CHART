# AWS Deploy

`App Deploy` runs the core app on one EC2 host from the `dev` branch.

The workflow:

1. validates API and web;
2. SSHes into the host using GitHub secrets;
3. resets `/opt/chart` to `origin/dev`;
4. runs `infra/aws/deploy-app.sh`.

The script runs Docker containers for Postgres, Keycloak, API, web, and nginx.
Only nginx is public:

- `/`: Next web app
- `/chart-api`: Fastify API
- `/identity`: Keycloak

## GitHub Secrets

Required:

- `AWS_APP_HOST`: EC2 SSH host.
- `AWS_APP_USER`: EC2 SSH user.
- `AWS_APP_SSH_KEY`: private SSH key. Its public key must be in
  `/home/<AWS_APP_USER>/.ssh/authorized_keys`.

Optional:

- `AWS_APP_PUBLIC_HOST`: browser-facing hostname. Use this for a subdomain.

## Workflows

- `API`: API checks only.
- `Web UI`: Next/web checks only.
- `Storybook Pages`: Storybook build and Pages publish.
- `App Deploy`: API + web checks, then EC2 deploy.
