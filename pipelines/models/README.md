# Model artifacts

Fitted `.rds` artifacts live under `artifacts/`, laid out **exactly as they are
in S3**:

```
pipelines/models/artifacts/<country>/<outcome>/<version>/<filename>.rds
                           ^-------------------------^
                           the key under s3://chart-predictive-models/
```

So a release's `base_uri` and its local path are the same string:

| manifest `base_uri`                                                                 | local path                                                                         |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `s3://chart-predictive-models/india/mp/lbw/1.0.1-compact-review`                    | `pipelines/models/artifacts/india/mp/lbw/1.0.1-compact-review/`                    |
| `s3://chart-predictive-models/kenya/under-five-mortality/0.1.0-climate-zone-review` | `pipelines/models/artifacts/kenya/under-five-mortality/0.1.0-climate-zone-review/` |

Uploading a new artifact is then a copy rather than a lookup, and a manifest
pointing at the wrong bucket or prefix is visible on sight. It was not always
so: artifacts used to sit in `<outcome>/model/`, grouped differently from S3,
and the mismatch hid a Kenya manifest that named a bucket the deploy never
syncs. The file was absent from production for a day, and because
`_auto_seed_deployed_models` aborts on one missing artifact, it took
registration for all four models down with it.

## What actually finds them

Nothing depends on this layout. The runtime resolves an artifact by
**searching `MODEL_CACHE_DIR` recursively for the filename** and then checking
its sha256 (`warm_model_artifact`). Two consequences:

- **Filenames must be unique across the whole tree.** Two files with the same
  name anywhere under the root is `matches=2` and the release fails to load.
  The version belongs in the _filename_, not only the directory - which is
  what the modellers already do (`..._v0.1.0-review.rds`).
- **Never rename what a modeller sends.** The manifest pins both the filename
  and the sha256; a rename or a re-export breaks both.

The layout is therefore for people, not for code - which is exactly why it
needs writing down.

## In the image and on the server

`.dockerignore` excludes `**/*.rds`, so artifacts are never baked into an
image. In production they arrive in the `/models` volume from
`aws s3 sync s3://$MODEL_BUCKET/ /models/ --exclude "archive/*"`, which runs
as the `chart-model-sync` service on deploy. Retire superseded artifacts to
`archive/` in the bucket: the sync skips that prefix, so they stay for
provenance without ever colliding in `/models`.

Locally the files here are gitignored working copies; the manifests beside
them are the tracked source of truth.
