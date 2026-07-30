# CHART Climate API

Python service for climate preview and LBW prediction. Its default local base
URL is `http://127.0.0.1:3210`.

## Interactive documentation

Start the service:

```bash
make climate-api
```

These local addresses become available after the service starts:

| Local address | Purpose |
|---|---|
| `http://127.0.0.1:3210/docs` | Swagger UI — try requests in the browser |
| `http://127.0.0.1:3210/redoc` | ReDoc — readable reference |
| `http://127.0.0.1:3210/openapi.json` | Machine-readable OpenAPI 3 specification |

For a reference that works without starting CHART, use the published
[API explorer](api-reference.md).

Export a checked-in copy of the spec (for sharing / CI):

```bash
make climate-openapi
# writes docs/openapi/climate.json
```

New engine endpoints belong in this Python service.

## Endpoints

| Method | Path                                | Purpose                                          |
| ------ | ----------------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                           | Service health                                   |
| `GET`  | `/auth/me`                          | Keycloak user, role, and geography context       |
| `GET`  | `/auth/geography-access`            | Check geography scope from the Keycloak token    |
| `GET`  | `/climate/locations`                | Supported `location_slug` values                 |
| `GET`  | `/climate/timeframes`               | Standard `timeframe_id` values                   |
| `POST` | `/climate/preview`                  | Check data availability + return series          |
| `POST` | `/climate/predict`                  | Preview or enqueue an LBW prediction             |
| `GET`  | `/climate/prediction-requests/{id}` | Poll queued/running prediction status and result |

Prediction submission and status polling require a Keycloak access token. Location,
timeframe, and preview endpoints remain public.

## Request parameters

### `location_slug` (required)

| Value            | Name                  | LBW predict               |
| ---------------- | --------------------- | ------------------------- |
| `madhya-pradesh` | Madhya Pradesh, India | yes                       |
| `kajiado`        | Kajiado, Kenya        | no (climate preview only) |

### `timeframe_id` (required)

| Value               | Horizon |   Months | Ingested | Use for                                   |
| ------------------- | ------- | -------: | -------- | ----------------------------------------- |
| `exposure_3m`       | short   |        3 | yes      | **LBW prediction** — last 3 monthly means |
| `recent_12m`        | short   |       12 | yes      | Recent-year charts / checks               |
| `historical_window` | short   | full run | yes      | Full ERA5 window in Postgres              |
| `seasonal`          | medium  |        6 | no       | Placeholder — seasonal tier not built     |
| `projection`        | long    |        — | no       | Placeholder — projection tier not built   |

### `end_month` (optional)

- Format: `YYYY-MM` (e.g. `2024-12`)
- Anchor month for rolling windows. Omitted = latest month in `district_climate`.

### `outcome` (optional, predict only)

| Field       | Type              | Required | Description                                              |
| ----------- | ----------------- | -------- | -------------------------------------------------------- |
| `type`      | `"lbw"`           | yes      | Only supported outcome today                             |
| `trimester` | `1` \| `2` \| `3` | yes      | LBW trimester window (1 = latest / T3)                   |
| `area`      | string            | no       | `Madhya Pradesh` (state) or division name; default state |
| `ref`       | number            | no       | Reference temperature °C; default from model             |

## Availability `status`

| Status          | Meaning                         | Action                                   |
| --------------- | ------------------------------- | ---------------------------------------- |
| `ready`         | All requested months present    | Safe to predict                          |
| `partial`       | Some months missing             | Materialise or change `end_month`        |
| `missing`       | No usable data                  | `PRESET=<slug> make climate-materialize` |
| `stale`         | Data older than monthly cadence | Re-materialise                           |
| `not_available` | Tier not ingested yet           | Use an observed timeframe                |

## On-demand prediction workflow

Every new LBW outcome request creates or reuses a durable `prediction_request` row
and returns `202 Accepted` without holding the HTTP connection open:

```json
{
  "request_id": 12,
  "status": "queued",
  "stage": "queued",
  "location_slug": "madhya-pradesh",
  "timeframe_id": "exposure_3m",
  "status_url": "/climate/prediction-requests/12",
  "message": "Prediction is queued for background processing."
}
```

The Dagster sensor launches one run for that request. The run first tries the R scorer
using stored climate data. It materialises the requested ERA5 geography only when those
months are missing, then retries the scorer and persists the result. Poll `status_url`
until `status` is `completed` or `failed`; `stage` reports `queued`, `predicting`,
`preparing_climate`, `completed`, or `failed`.

Submitting the same normalized request while it is queued or running returns the same
request id. Submitting it after completion returns the persisted result immediately and
does not create another Dagster run. A failed request is requeued with an incremented
attempt number when submitted again.

Redis is not required: Postgres is the durable user/request state and Dagster owns job
execution, logs, and run history.

## Error codes

Invalid submissions return an HTTP error before entering the queue:

| HTTP | `error`                           | When                              |
| ---- | --------------------------------- | --------------------------------- |
| 400  | `LBW_NOT_AVAILABLE_FOR_LOCATION`  | LBW requested for non-MP location |
| 400  | `LBW_REQUIRES_EXPOSURE_TIMEFRAME` | LBW requires `exposure_3m`        |

Background failures are returned by the status endpoint with `status: "failed"` and an
`error_code`, including `CLIMATE_DATA_NOT_READY`, `LBW_PREDICT_FAILED`, or
`LBW_SERVICE_NOT_CONFIGURED`.

## Environment variables

| Variable                       | Default                                  | Purpose                            |
| ------------------------------ | ---------------------------------------- | ---------------------------------- |
| `DATABASE_URL`                 | —                                        | Postgres (`district_climate`)      |
| `LBW_SERVICE_URL`              | `http://127.0.0.1:8000`                  | LBW Plumber API                    |
| `KEYCLOAK_ISSUER_URL`          | `http://127.0.0.1:8080/realms/chart`     | Required token issuer              |
| `KEYCLOAK_CLIENT_ID`           | `chart-api`                              | Client role namespace              |
| `KEYCLOAK_JWKS_URL`            | `<issuer>/protocol/openid-connect/certs` | Internal signing-key endpoint      |
| `KEYCLOAK_CLOCK_SKEW_SECONDS`  | `30`                                     | Token timestamp tolerance          |
| `HOST`                         | `127.0.0.1`                              | Bind address                       |
| `PORT`                         | `3210`                                   | Listen port                        |

## Example

```bash
curl -s http://127.0.0.1:3210/climate/predict \
  -H 'authorization: Bearer <keycloak-access-token>' \
  -H 'content-type: application/json' \
  -d '{
    "location_slug": "madhya-pradesh",
    "timeframe_id": "exposure_3m",
    "outcome": {"type": "lbw", "trimester": 1, "area": "Gwalior"}
  }' | jq .
```
