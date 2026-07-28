FROM python:3.11-slim

ENV DAGSTER_HOME=/opt/dagster/dagster_home
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/alembic.ini backend/alembic.ini
COPY backend/alembic backend/alembic
COPY backend/chart backend/chart
COPY pipelines/era5_heat/pyproject.toml pipelines/era5_heat/pyproject.toml
COPY pipelines/era5_heat/src pipelines/era5_heat/src
COPY orchestration/pyproject.toml orchestration/pyproject.toml
COPY orchestration/src orchestration/src
COPY orchestration/dagster.production.yaml /opt/dagster/dagster_home/dagster.yaml

RUN python -m pip install --upgrade pip \
  && python -m pip install ./backend ./pipelines/era5_heat ./orchestration \
  && mkdir -p /opt/dagster/storage

WORKDIR /app/backend

EXPOSE 3000 3210

CMD ["python", "-m", "chart"]
