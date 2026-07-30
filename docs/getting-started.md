# Getting started

This guide starts the complete CHART development environment on your computer.

## Requirements

Install these before continuing:

- Docker Desktop, with the Docker engine running
- Node.js 22 and npm
- Python 3.11
- Git

`uv` is optional. When it is installed, the Makefile uses it to create and
populate the Python environment more quickly.

## Install CHART

From a terminal:

```bash
git clone https://github.com/CHART-Scope/CHART.git
cd CHART
make install
```

If you already have the repository, update it and run `make install` from the
repository root.

## Start the application

```bash
make run
```

The first run starts the local infrastructure, applies database migrations,
loads seed data, and starts the web, API, and Dagster processes. Keep this
terminal open while using CHART.

After startup, open the service you need:

| Service | Local address |
|---|---|
| CHART web application | `http://127.0.0.1:3100` |
| CHART API documentation | `http://127.0.0.1:3210/docs` |
| Dagster | `http://127.0.0.1:3002` |
| Keycloak | `http://127.0.0.1:8080` |
| Mailpit inbox | `http://127.0.0.1:8025` |

!!! important "These are local addresses"
    Addresses beginning with `127.0.0.1` only work on the computer running
    CHART, and only while the relevant service is running. They are shown as
    text rather than public links for that reason.

## Verify the setup

Check that the Python API is healthy:

```bash
curl http://127.0.0.1:3210/health
```

The response should be:

```json
{"status":"ok"}
```

Then open the CHART web application at `http://127.0.0.1:3100`.

## Climate pipeline only

To work on the climate data path without starting the complete web application:

```bash
make migrate
PRESET=madhya-pradesh make climate-materialize
make dev
```

`make dev` keeps Dagster running at `http://127.0.0.1:3002`. In another
terminal, start the Python API:

```bash
make climate-api
```

## Documentation only

To preview this documentation site locally:

```bash
make install
make docs-serve
```

The preview is available at `http://127.0.0.1:8000`.

## Common startup problems

### Docker is not running

Start Docker Desktop, wait for the Docker engine to become ready, and run
`make run` again.

### Port 8080 is already in use

CHART uses port `8080` for Keycloak. Stop the other local application or
container using that port, then run `make run` again. The startup command
reports the name of a conflicting Docker container when it can.

### A service stopped during startup

Read the first error in the terminal, correct it, and rerun `make run`. Database
migrations and seed operations are designed to be rerun safely.
