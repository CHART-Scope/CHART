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

## EC2 prerequisites

- Docker installed and running.
- Port 80 open in the EC2 security group.
- The deploy SSH key's public key in `/home/<AWS_APP_USER>/.ssh/authorized_keys`.

## Ops

**Check container status:**

```bash
docker ps -a --filter "name=chart-"
```

**Tail logs:**

```bash
docker logs chart-web --tail 50
docker logs chart-api --tail 50
docker logs chart-proxy --tail 50
```

**Reset a user to re-experience onboarding:**

```bash
docker exec -it chart-postgres psql -U chart -d chart \
  -c "DELETE FROM users WHERE email = 'chart-admin@example.org';"
```

**Full wipe and redeploy:**

```bash
docker rm -f chart-proxy chart-web chart-api chart-keycloak chart-keycloak-postgres chart-postgres
docker volume rm chart-postgres-data chart-keycloak-postgres-data
PUBLIC_HOST=<host> bash /opt/chart/infra/aws/deploy-app.sh
```

**Find the Keycloak admin password:**

```bash
grep KEYCLOAK_ADMIN_PASSWORD /opt/chart-env/chart.env
```

## Workflows

- `API`: API checks only.
- `Web UI`: Next/web checks only.
- `Storybook Pages`: Storybook build and Pages publish.
- `App Deploy`: API + web checks, then EC2 deploy.
