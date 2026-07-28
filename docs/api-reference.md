# OpenAPI reference

Specs on this page are generated from the running services — not hand-written prose.
Regenerate before publishing:

```bash
make climate-openapi
make docs-prepare
```

## Climate API (Python) — primary

FastAPI service for climate preview and LBW prediction. This is the direction of travel
for engine-facing HTTP endpoints.

**Local base URL:** `http://127.0.0.1:3210`

**Live Swagger:** [http://127.0.0.1:3210/docs](http://127.0.0.1:3210/docs)

<swagger-ui src="openapi/climate.json"/>

Parameter semantics and availability statuses are explained in [Climate API](climate-api.md).

## CHART app API (Fastify) — legacy

The interim TypeScript API still powers much of the web app. It will shrink as modules
move to Python. Spec is copied from `api/openapi.yaml` at docs build time.

**Local base URL:** `http://127.0.0.1:3200`

**Live Swagger:** [http://127.0.0.1:3200/api](http://127.0.0.1:3200/api)

<swagger-ui src="openapi/fastify.yaml"/>

See [Legacy Fastify API](legacy-fastify-api.md) for scope and retirement plan.
