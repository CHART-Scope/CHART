FROM python:3.11-slim

ENV DAGSTER_HOME=/opt/dagster/dagster_home
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Model manifest discovery in chart.setup.model_configs walks
# CHART_REPO_ROOT/pipelines/models/**/model-release.*.json. After pip
# install the site-packages layout breaks the __file__-relative default,
# so pin it to /app where the WORKDIR + COPYs actually land.
ENV CHART_REPO_ROOT=/app

WORKDIR /app

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/alembic.ini backend/alembic.ini
COPY backend/alembic backend/alembic
COPY backend/chart backend/chart
COPY backend/scripts backend/scripts
COPY pipelines/era5_heat/pyproject.toml pipelines/era5_heat/pyproject.toml
COPY pipelines/era5_heat/src pipelines/era5_heat/src
COPY pipelines/seasonal_c3s/pyproject.toml pipelines/seasonal_c3s/pyproject.toml
COPY pipelines/seasonal_c3s/src pipelines/seasonal_c3s/src
COPY pipelines/isimip_projection/pyproject.toml pipelines/isimip_projection/pyproject.toml
COPY pipelines/isimip_projection/src pipelines/isimip_projection/src
COPY pipelines/boundaries/pyproject.toml pipelines/boundaries/pyproject.toml
COPY pipelines/boundaries/src pipelines/boundaries/src
COPY pipelines/boundaries/data pipelines/boundaries/data
COPY pipelines/boundaries/manifests pipelines/boundaries/manifests
# Copy every model manifest under pipelines/models. The `.rds` artifacts
# are gitignored so they don't ship in the image — they're pulled from
# S3 into the shared chart-lbw-model volume at deploy time. Wildcarding
# the whole tree means a new manifest lands on the sandbox by just
# committing it; no Dockerfile edit required.
COPY pipelines/models pipelines/models
COPY orchestration/pyproject.toml orchestration/pyproject.toml
COPY orchestration/src orchestration/src
COPY orchestration/dagster.production.yaml /opt/dagster/dagster_home/dagster.yaml

RUN python -m pip install --upgrade pip \
  && python -m pip install ./backend ./pipelines/era5_heat ./pipelines/seasonal_c3s ./pipelines/isimip_projection ./pipelines/boundaries ./orchestration \
  && mkdir -p /opt/dagster/storage

WORKDIR /app/backend

EXPOSE 3000 3210

CMD ["python", "-m", "chart"]
