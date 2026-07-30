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

## How to read the contract

- Routes marked with `bearerAuth` require a Keycloak access token in the
  `Authorization: Bearer <token>` header.
- Authentication alone does not grant analytical access. Protected planning,
  prediction, workspace, and user routes also enforce role and geography scope.
- `POST /climate/predict` returns `200` when a completed idempotent request can
  be returned immediately. It returns `202` when Dagster has queued new work;
  poll the response's status URL until the request completes or fails.
- `422` means a path, query, or request-body value did not satisfy the published
  schema. Endpoint-specific authorization, availability, and conflict responses
  remain listed under each operation.
- Public hazard and solution routes do not require sign-in. They read the
  configured public repository service and fall back to the bundled snapshot.

<swagger-ui src="openapi/climate.json"/>

Parameter semantics and availability statuses are explained in [Climate API](climate-api.md).

??? info "Regenerate the contract"
    Contributors can refresh the checked-in Python specification with:

    ```bash
    make climate-openapi
    ```
