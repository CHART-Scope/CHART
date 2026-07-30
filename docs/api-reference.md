# API explorer

This page embeds snapshots of CHART's OpenAPI contracts. OpenAPI is a
machine-readable description of an API: its paths, request fields, responses,
and authentication rules.

You do not need to open the underlying `.json` or `.yaml` files to use this
page. Expand an endpoint below to read its parameters and response schema.

!!! note "Reference, not a running API"
    The embedded explorers describe the APIs but do not turn this documentation
    site into an API server. To send test requests, start CHART locally and use
    the local Swagger address shown for that service.

## Climate API (Python) — primary

The FastAPI service owns climate preview and prediction endpoints, plus Python
auth and geography routes as they migrate.

**Local base URL:** `http://127.0.0.1:3210`

After running `make climate-api`, use the local Swagger UI at
`http://127.0.0.1:3210/docs`.

<swagger-ui src="openapi/climate.json"/>

Parameter semantics and availability statuses are explained in [Climate API](climate-api.md).

## CHART app API (Fastify) — legacy

The interim TypeScript API still powers parts of the web application. Its
published contract is generated during the documentation build.

**Local base URL:** `http://127.0.0.1:3200`

After running `make run`, use its local Swagger UI at
`http://127.0.0.1:3200/api`.

<swagger-ui src="openapi/fastify.yaml"/>

See [Legacy Fastify API](legacy-fastify-api.md) for scope and retirement plan.

??? info "Regenerate the contracts"
    Contributors can refresh the checked-in Python contract and prepare both
    specifications with:

    ```bash
    make climate-openapi
    make docs-prepare
    ```
