# CHART climate and prediction API

The Python service is the only CHART application API. Its local address is
`http://127.0.0.1:3210`.

Read [Modeling](modeling.md) before interpreting LBW odds ratios, confidence
intervals, or extrapolation warnings.

## See and test the API

- Swagger: `http://127.0.0.1:3210/docs`
- ReDoc: `http://127.0.0.1:3210/redoc`
- OpenAPI: `http://127.0.0.1:3210/openapi.json`

Run it with `make climate-api`. Refresh the checked-in API file with
`make climate-openapi`.

For a reference that works without starting CHART, use the published
[API explorer](api-reference.md).

## Prediction flow

1. The user selects a supported place and a planner-friendly time option.
2. `POST /climate/predict` saves the request and returns its ID.
3. Dagster gets the three required monthly temperatures.
4. CHART checks and saves the exact data used.
5. The model registered for that place calculates only the windows explicitly
   validated in its model-area mapping.
6. The UI polls `GET /climate/prediction-requests/{id}` and shows the data trace
   and result.

The API does not accept a temperature, model file, model area, reference value,
or climate-source choice from the user.

## Main routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check that the Python service is running |
| `GET` | `/geographies` | List places available to the signed-in user |
| `GET` | `/climate/locations` | List places with their prediction support and model version |
| `POST` | `/climate/preview` | Show the three saved climate months for a planning month |
| `POST` | `/climate/predict` | Save or reuse a prediction request |
| `GET` | `/climate/prediction-requests` | List the signed-in user's saved plans |
| `GET` | `/climate/prediction-requests/{id}` | Read progress, data trace, and result |

Authentication, setup, user, workspace, hazard, and solution routes are also in
this service. The generated OpenAPI file is the full route reference.

## Prediction request

```json
{
  "geography_id": "geo-in-madhya-pradesh",
  "planning_date": "2026-10-01",
  "outcome": "lbw",
  "planning_target": "next_three_months",
  "pregnancy_windows": [1]
}
```

`planning_date` selects a calendar month. The day is not used. CHART needs that
month and the previous two months.

The current Madhya Pradesh state mapping accepts only `[1]`, representing the
one original pooled state model. CHART does not attach a pregnancy-stage label
to that result. Division mappings may accept `[3, 2, 1]` because their release
contains three distinct fitted blocks. Unsupported window requests return
`MODEL_PREGNANCY_WINDOW_NOT_VALIDATED`.

A new request returns `202 Accepted`:

```json
{
  "request_id": 12,
  "status": "queued",
  "stage": "queued",
  "geography_id": "geo-in-madhya-pradesh",
  "planning_date": "2026-10-01",
  "status_url": "/climate/prediction-requests/12",
  "message": "Prediction is queued for background processing."
}
```

Sending the same request again reuses the saved work. A failed request can be
retried. Postgres stores the request and result; Dagster runs the background
work.

A next-hot-season request beyond the current C3S range returns `waiting` and an
`available_from` date. It remains saved. Dagster changes it to `queued` when the
real seasonal forecast can cover the three months.

## What the result proves

The completed response includes:

- the request ID and Dagster run ID;
- all three temperatures and months;
- source name, source link, issue time, download time, raw-file location, and
  raw-file hash;
- the saved climate-input ID and hash;
- model file and version;
- only the model outputs validated for that place, with odds ratios, 95%
  intervals, support warnings, and optional explanation.

The model is blocked when data is missing, stale, sample-only in live mode, or
does not match the selected place.

## Climate sources

- ERA5 supplies past observed/reanalysis data.
- C3S seasonal data supplies the currently supported future planning months.
- ISIMIP3b supplies the approved March–May 2031–2040 long-term scenarios.
- Near-term ECMWF AWS data remains unavailable until its complete-month checks
  are implemented.

The deployment owns the Copernicus key. A normal user is never asked for it.

## Required configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | CHART Postgres/PostGIS database |
| `KEYCLOAK_ISSUER_URL` | Accepted token issuer |
| `KEYCLOAK_CLIENT_ID` | CHART API client name |
| `CDSAPI_KEY` | Server-side Copernicus download key |
| `INFERENCE_LBW_BASE_URL` | LBW R service address |

The optional explanation is disabled unless `INFERENCE_LLM_ENABLED=true` and an
OpenAI-compatible `INFERENCE_LLM_BASE_URL` and `INFERENCE_LLM_MODEL` are set.
Its failure never changes the numerical model result.
