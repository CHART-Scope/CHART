# Legacy Fastify API

!!! warning "Interim only"
    The TypeScript Fastify app in `api/` is being replaced by the Python `backend/chart/api`
    package. New climate and engine endpoints belong in Python. App modules (auth, workspaces,
    hazards, solutions) will migrate module-by-module behind the OpenAPI contract.

## What still runs here

| Area | Status |
|---|---|
| Auth / Keycloak context | Fastify |
| Workspaces, users, geographies | Fastify |
| Hazards, solutions repository reads | Fastify |
| Climate preview / predict | **Moved to Python** (`make climate-api`) |

## Local access

```bash
make api
```

- Web app: [http://127.0.0.1:3100](http://127.0.0.1:3100)
- Swagger UI: [http://127.0.0.1:3200/api](http://127.0.0.1:3200/api)
- OpenAPI file: `api/openapi.yaml` (generate with `make api-openapi-generate`)

## Docs

Embedded spec (when built): [OpenAPI reference](api-reference.md#chart-app-api-fastify-legacy).

Target architecture is described in [Technical design (draft)](tdd.md) §4 and §8.
