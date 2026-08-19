# LBW model family

Manifests and compact `.rds` artifacts for low-birth-weight releases (India MP,
Kenya). The R runtime that scores these lives one level up at
[`pipelines/models/`](../README.md) and serves every family through the same
process.

## Currently deployed

| Manifest                               | Model file                                   | Release id                         |
| -------------------------------------- | -------------------------------------------- | ---------------------------------- |
| `model-release.mp.compact.review.json` | `IN_MP_LBW_tmax_v1.0.1-compact.rds`          | `lbw-mp-1.0.1-compact-review`      |
| `model-release.kenya.review.json`      | `KE_climate_zone_LBW_tmax_v0.2.1-review.rds` | `lbw-ke-climate-zone-0.2.1-review` |

Both manifests declare `runtime.adapter: "compact_r_registry"` so they use the
shared DLNM scorer under `../inference/adapters/`. Manifests carry the S3
`base_uri`, per-file SHA-256, input contract, presentation config, and
installation geography.

Compact artifacts must contain only basis settings, coefficients, covariance
matrices, reference temperatures, supported ranges, and aggregate training
counts — never respondent rows, household identifiers, coordinates, fitted
model frames, or other restricted microdata.

## Running

Use `make run` from the repo root — the runtime auto-loads any manifest in this
directory. See [Installation setup — Model registry control
token](../../../docs/installation-setup.md#model-registry-control-token) and
[the shared runtime README](../README.md) for details on env vars, ports, and
Docker builds.

## Sourcing files

`.rds` files are gitignored. Place them under `model/` locally (that path is
inside the default `MODEL_CACHE_DIR`) or point `MODEL_CACHE_DIR` at wherever
your deploy pipeline lays them down. The R runtime never downloads — the
backend hashes each artifact and passes `local_path` to `/models/load`.

## Related

- [Model registry runtime](../README.md) — adapter dispatch, endpoints, env vars.
- [Model releases](../../../docs/model-updates.md) — manifest schema.
- [Add a geography and model](../../../docs/add-geography-and-model.md).
- [Modeling](../../../docs/modeling.md) — interpretation.
