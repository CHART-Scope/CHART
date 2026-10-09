# CHART

Build simple, maintainable code and verify that it works end to end. Follow the
current task and repository implementation; keep this guide focused on
engineering practices, not a fixed product roadmap.

## Allow The Product To Evolve

- Domains and features are open-ended. Add or reshape modules when the task
  requires it; existing folders are conventions, not a closed list of allowed
  capabilities.
- Support new data sources and predictive modeling, including hydrological
  data and vulnerability/resilience assessments, without forcing them into
  unrelated modules.
- Keep product scope, priorities, and detailed designs in the relevant
  documentation. Do not infer a build order or product restriction from this
  guide.
- Prefer the smallest useful implementation. Introduce abstractions,
  dependencies, or structural changes when they solve a concrete problem; avoid
  speculative frameworks and unrelated refactors.

## Architecture

CHART is a monorepo;

| Path           | Responsibility                                                                        |
| -------------- | ------------------------------------------------------------------------------------- |
| web/           | Next/React UI and typed API clients                                                   |
| core/          | Python/FastAPI API, business logic, analytical engine, database models and migrations |
| orchestration/ | Dagster orchestration and background execution                                        |
| pipelines/     | Data adapters, processing, model runtimes                                             |
| infra/         | Development and deployment infrastructure                                             |
| docs/          | Maintained project documentation                                                      |
| e2e/           | End-to-end tests and shared test support                                              |
| outputs/e2e/   | Generated test reports and evidence                                                   |

- Keep routes thin and business logic in services. Next route handlers may
  proxy browser/session requests; Python owns application workflows,
  authorization, and database access.
- Keep analytical computation independent of FastAPI and Dagster.
  Orchestration should call services through thin wrappers.
- Follow existing conventions where they fit. Create focused modules as
  capabilities grow; avoid duplicate implementations and unnecessary services.
- Use the current SQLAlchemy/Alembic and PostgreSQL/PostGIS setup. Commit
  migrations with schema changes and protect data integrity.
- Integrate external systems through explicit adapters and public contracts.
  Keep their internal code, tables, and deployment assumptions outside CHART.

## Code And Behavior

- Use clear names, focused functions, and small cohesive files. Keep business
  logic out of UI components and validate inputs at system boundaries.
- Follow language conventions: Python snake_case, TypeScript camelCase, and
  React PascalCase components. Use existing formatting and linting tools.
- Keep errors explicit and stable. Account for retries, partial failures, and
  persisted state in background workflows.
- Enforce applicable role, workspace, and geography permissions on protected
  operations. Authentication alone is insufficient; keep intentionally public
  content accessible.
- Keep secrets and sensitive data out of source, client bundles, logs, and
  test artifacts.
- Keep deterministic analytical results independent of optional AI
  explanations. Document relevant data provenance, units, assumptions, and
  missing-data handling.
- Update relevant documentation when behavior, architecture, setup, or commands
  change.

## Mandatory E2E Testing

- Never write unit tests. Every code change must add or update E2E coverage for
  the changed behavior.
- Store E2E tests and shared support in root e2e/; connect them to make e2e.
  Run make e2e for every change, including documentation and configuration
  changes; use existing coverage when behavior is unchanged.
- Exercise real application boundaries and assert observable outcomes,
  including persisted results. Mocks, builds, typechecks, and route-level
  integration tests do not replace E2E verification.
- Cover relevant failure modes, denied access, scope isolation, retries, and
  browser error states. Bug fixes need a regression scenario that fails before
  the fix and passes afterward.
- Use disposable test data. Never bypass authentication, modify production data,
  or skip/weaken failing tests to obtain a pass.
- Each run must save repeatable evidence in outputs/e2e/: command, source
  revision and working-tree status, setup and fixtures, results, and relevant
  failure logs or traces. Exclude secrets and sensitive data.
- Run applicable build, typecheck, formatting, and existing integration checks
  using repository scripts. Inspect the current Makefile and package
  configuration rather than guessing commands.
- Before finishing, report commands, results, artifact paths, and unverified
  behavior. If E2E cannot run, state the blocker and mark verification
  incomplete; never claim tests passed without evidence.
