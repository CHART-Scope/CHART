# API explorer

This page embeds the snapshot of CHART's OpenAPI contract. OpenAPI is a
machine-readable description of an API: its paths, request fields, responses,
and authentication rules.

You do not need to open the underlying `.json` or `.yaml` files to use this
page. Expand an endpoint below to read its parameters and response schema.

!!! note "Reference, not a running API"
    The embedded explorers describe the APIs but do not turn this documentation
    site into an API server. To send test requests, start CHART locally and use
    the local Swagger address shown for that service.

The contract is generated from the single Python API:

```bash
make climate-openapi
```

FastAPI owns the CHART application, authentication, geography, climate, setup,
workspace, user, hazard, and solution endpoints.

**Local base URL:** `http://127.0.0.1:3210`

After running `make climate-api`, use the local Swagger UI at
`http://127.0.0.1:3210/docs`.

<swagger-ui src="openapi/climate.json"/>

Parameter semantics and availability statuses are explained in [Climate API](climate-api.md).

??? info "Regenerate the contract"
    Contributors can refresh the checked-in Python specification with:

    ```bash
    make climate-openapi
    ```
