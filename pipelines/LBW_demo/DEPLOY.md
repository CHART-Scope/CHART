# Deploy the LBW demo to CHART EC2

The LBW service is deployed automatically when a commit to `main` changes
`pipelines/LBW_demo/`, `infra/`, or the app-deploy workflow. It runs as the
internal `chart-lbw` Docker container and is reachable through the existing
reverse proxy at:

```text
http://<AWS_APP_HOST>/lbw/ui/
http://<AWS_APP_HOST>/lbw/health
```

Do not publish port 8000 directly. The EC2 security group should continue to
expose only port 80 for this demo environment.

## One-time AWS setup

### 1. Upload the model to a private S3 bucket

Choose a versioned object key so a new model release is a new S3 path:

```bash
aws s3 cp \
  model/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds \
  s3://YOUR_PRIVATE_BUCKET/lbw-models/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds
```

Do not make the object public and do not commit the `.rds` file to Git.

### 2. Grant the EC2 instance role access

Attach this policy to the IAM role already assigned to the CHART EC2 instance,
replacing the bucket and prefix. If the bucket uses a customer-managed KMS key,
also grant that role `kms:Decrypt` for the key.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET/lbw-models/*"
    }
  ]
}
```

The container uses the instance role through the AWS SDK credential chain; do
not put long-lived AWS access keys in the repository or Docker image.

### 3. Configure the deployed host

SSH to the CHART EC2 instance and set the S3 URI in the persistent deployment
environment file:

```bash
cat >> /opt/chart-env/chart.env <<'EOF'
LBW_MODEL_S3_URI=s3://YOUR_PRIVATE_BUCKET/lbw-models/MP_division_LBW_tmax_DHS2015-21_v1.0.0.rds
EOF
chmod 600 /opt/chart-env/chart.env
```

`infra/aws/deploy-app.sh` preserves this value on later deploys. Removing the
line disables the LBW container on the next deployment.

## Deploy and verify

1. Commit and push the LBW source code, Docker configuration, workflow, and
   deployment-script changes to `main`.
2. Watch the **App Deploy** GitHub Actions workflow. It builds the LBW image,
   starts `chart-lbw`, downloads the S3 object to the persistent
   `chart-lbw-model` Docker volume, and waits for `/lbw/health`.
3. Open `http://<AWS_APP_HOST>/lbw/ui/`.
4. Confirm readiness:

```bash
curl -fsS http://<AWS_APP_HOST>/lbw/health
```

For a new model version, upload it to a new S3 key, update
`LBW_MODEL_S3_URI` on the host, then redeploy. The new filename causes the
container to download it without overwriting the previous cached model.

## Troubleshooting

- **Deployment does not start:** confirm the commit includes a path matched by
  `.github/workflows/app-deploy.yml`, especially `pipelines/LBW_demo/**`.
- **`LBW inference through proxy` times out:** inspect the service log:
  `docker logs chart-lbw`. Usually the instance role cannot read the S3 object
  or the URI is wrong.
- **`AccessDenied` from S3:** confirm the EC2 instance has an IAM role and the
  policy covers the exact object key (and KMS decrypt permission when used).
- **Old model remains active:** use a new, versioned object filename and update
  `LBW_MODEL_S3_URI`; do not replace a model at the same key.

This is a temporary test endpoint. It has no authentication layer yet, so do
not treat it as a production public inference API.
