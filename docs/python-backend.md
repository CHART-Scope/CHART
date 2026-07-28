# Python backend

`backend/chart/` is the only CHART backend.

```txt
backend/chart/
  api/                   FastAPI application
  auth/                  Keycloak token and access checks
  setup/ users/          application setup and user management
  workspaces/            geography-scoped planning workspaces
  geographies/           user places and analytical area mapping
  climate/               source-neutral monthly data and requests
  model_registry/        versioned model files and place mapping
  inference/             deterministic scorer and optional explanation
  solution_repository/   public repository adapter
  shared/db/             SQLAlchemy models; Alembic is the schema owner
  vra/                   future module placeholder only
```

Dagster imports these services through thin wrappers. Analytical code does not
import FastAPI or Dagster.

## Database and API

```bash
make migrate
make climate-api
make climate-openapi
```

API reference: [OpenAPI](api-reference.md). Place and model handoff:
[Add a geography and model](add-geography-and-model.md).
