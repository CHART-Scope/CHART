# Interactive API explorer

This page embeds CHART's complete OpenAPI contract inside the documentation
site. It uses the same Swagger interface as the running API while keeping the
MkDocs navigation, colours, search, and dark mode around it.

Every operation is expanded below. Use **Filter by tag** in the explorer to
find a route by area, such as `auth`, `climate`, `solutions`, `system`, or
`workspaces`.

For each operation, the explorer shows:

- the HTTP method, path, purpose, and authentication requirement;
- path, query, header, and request-body fields;
- required fields, types, formats, defaults, and example payloads;
- every documented response status and response schema;
- reusable models in the **Schemas** section.

!!! info "Explore here; run requests locally"
    This embedded explorer is intentionally read-only so that browsing the
    public documentation cannot send an accidental write to a live CHART
    deployment. To execute requests, start the API and open the runnable local
    Swagger interface.

[Open runnable local Swagger](http://127.0.0.1:3210/docs){ .md-button .md-button--primary }

The local API base URL is `http://127.0.0.1:3210`. Start it with:

```bash
make climate-api
```

<swagger-ui src="openapi/climate.json" nocache/>

Parameter semantics and availability statuses are explained in [Climate API](climate-api.md).

??? info "Regenerate the contract"
    The embedded contract is generated from the single FastAPI application.
    Contributors can refresh the checked-in snapshot with:

    ```bash
    make climate-openapi
    ```

    FastAPI owns CHART's application, authentication, geography, climate,
    setup, workspace, user, hazard, and solution endpoints.
