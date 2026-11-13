# Continuous integration and Claude review

## App Deploy

`.github/workflows/app-deploy.yml` runs on pull requests and on pushes to
`dev` and `main` that touch the app. Three jobs run in parallel:

| Job | Checks |
|---|---|
| Validate web | Prettier, identity tests, web typecheck, Compose and Caddy configuration |
| Validate Python | Ruff and types, Alembic upgrade and check, pytest against a PostGIS service, Dagster and OpenAPI contracts |
| Validate deploy images | Pull requests only: builds every deploy image (which runs the Next build and the model tests) from the layer cache that publish writes on `dev` |

A push to `dev` then publishes the images to GHCR and deploys them to EC2 once
the web and Python jobs pass.

## Claude review

`.github/workflows/claude.yml` runs Claude Code on Amazon Bedrock:

- **Review**: every non-draft pull request from this repository gets inline
  comments for real problems (bugs, missing permission checks, unsafe
  migrations, secrets, missing E2E) and one summary comment. A new push
  cancels the review still running for the same pull request.
- **Answer @claude**: a comment containing `@claude` on a pull request or issue,
  from an owner, member or collaborator, gets a reply.

Both jobs skip until `AWS_CLAUDE_ROLE_ARN` is set, so the workflow stays green
before setup.

!!! note "Cost"
    Claude review is a paid service. Every review and every `@claude` reply
    calls Claude through Amazon Bedrock in Scope Impact's AWS account, and the
    usage is billed there; there is no separate Anthropic subscription. A fork
    or independent deployment of CHART does not inherit it: without its own
    AWS account, role and GitHub App, the jobs simply skip.

### Setup

1. **Bedrock model access.** In the AWS console, under Amazon Bedrock → Model
   access (eu-north-1), enable the Claude model you will use.
2. **IAM role.** The account already trusts GitHub's OIDC provider (the action
   repository publish uses it). Create a role whose trust policy allows
   `sts:AssumeRoleWithWebIdentity` from
   `token.actions.githubusercontent.com` with audience `sts.amazonaws.com` and
   subject `repo:CHART-Scope/CHART:*`, and attach:

    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "bedrock:GetInferenceProfile",
            "bedrock:ListInferenceProfiles"
          ],
          "Resource": [
            "arn:aws:bedrock:*:*:inference-profile/*",
            "arn:aws:bedrock:*:*:foundation-model/*"
          ]
        }
      ]
    }
    ```

3. **GitHub App.** Create (or reuse) an organisation GitHub App with
   repository permissions Contents: read, Issues: read and write, Pull
   requests: read and write, and install it on `CHART-Scope/CHART`. The app
   posts the comments; the workflow's own `GITHUB_TOKEN` is not used for that.
4. **Repository settings.**

    ```sh
    gh variable set AWS_CLAUDE_ROLE_ARN --repo CHART-Scope/CHART --body arn:aws:iam::<account>:role/<role>
    gh secret set CLAUDE_APP_ID --repo CHART-Scope/CHART --body <app id>
    gh secret set CLAUDE_APP_PRIVATE_KEY --repo CHART-Scope/CHART < app-private-key.pem
    # Optional: another model or inference profile than eu.anthropic.claude-opus-5-5
    gh variable set CLAUDE_BEDROCK_MODEL --repo CHART-Scope/CHART --body <model id>
    ```

The `eu.` inference profile routes requests across EU regions. Check the
Bedrock console for the exact model IDs available to the account.
