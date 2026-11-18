# Secrets and permissions (in progress)

Where CHART's credentials live today, and the arrangement this work moves
towards. The aim: no long-lived keys in the repository, on a laptop or in a
CI log; each piece of CHART holds only the permission it uses; and every
permission is written down where it can be reviewed.

## Today

| Credential | Where it lives | Used by |
| --- | --- | --- |
| AWS, for publishing the action feed | none stored: GitHub OIDC assumes `chart-actions-publisher` | `publish-actions.yml` |
| AWS, on the server (model bucket, Bedrock) | EC2 instance role | core, model sync |
| `AIRTABLE_TOKEN` | GitHub secret (`actions-publish` environment) | `publish-actions.yml` |
| SSH key, host, user for deploys | GitHub `dev` environment secrets | `app-deploy.yml` |
| Database, Keycloak admin, bootstrap, model control, SMTP, Google SSO, Anthropic/OpenAI, CDS keys | `~/chart-deploy/aws/.env.prod` on the EC2 host, written by hand (`chmod 600`) | `infra/aws/docker-compose.yml` |
| Slack webhook | GitHub secret | `merge-notify.yml` |

The buckets, the instance role and the publisher role are created by hand
(`docs/actions.md`, `infra/aws/README.md`); none is described in code.

## Target

1. **Buckets are private unless the content is meant for anyone.** The
   action repository moves to private (`docs/actions.md`, "Making the
   repository private"). The model bucket's `media/` (the explainer video)
   and the ERA5 mirror stay public; model artifacts move behind the instance
   role (`MODEL_BUCKET_PUBLIC=0`).
2. **Server secrets come from SSM Parameter Store**, not a hand-written file:
   one `SecureString` per value under `/chart/<environment>/`, encrypted
   with a CHART KMS key. The deploy reads them with the instance role
   (`ssm:GetParametersByPath` on `/chart/<environment>/*`, `kms:Decrypt` on
   that key) into the containers' environment, so rotating a secret is a
   parameter change and a redeploy. `.env.prod` keeps only non-secret
   settings (origin, region, bucket names).
3. **Each role holds what it uses.** Instance role: read the model bucket
   and the action feed, invoke the chosen Bedrock models, read
   `/chart/<environment>/*`. Publisher role: write and read `v1/` in the
   action bucket, assumable only from the `actions-publish` environment.
4. **Permissions are code.** A small Terraform module under `infra/aws/`
   for the buckets, policies and roles, applied by hand at first, so a
   change to who may read what is reviewed in a pull request.

## Not yet done

- [ ] Instance role policy for the action feed (rollout step 1) and the
      `s3://` URL on the sandbox.
- [ ] Make the action bucket private (rollout step 5).
- [ ] Model artifacts private: `MODEL_BUCKET_PUBLIC=0` with the instance
      role, `media/` kept public by a prefix-scoped policy.
- [ ] SSM Parameter Store for `.env.prod` secrets, and a deploy step that
      reads them.
- [ ] Terraform for the buckets, policies and roles.
- [ ] Live e2e: serve the feed from a private S3 stand-in (MinIO) and check
      signed image links.
