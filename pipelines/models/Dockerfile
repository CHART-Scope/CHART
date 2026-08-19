FROM rocker/r-ver:4.6.0 AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl libcurl4-openssl-dev libicu-dev libsodium-dev \
  && rm -rf /var/lib/apt/lists/*

RUN R -q -e 'packages <- c("dlnm", "plumber", "jsonlite"); install.packages(packages, repos = "https://cloud.r-project.org"); if (!all(vapply(packages, requireNamespace, logical(1), quietly = TRUE))) stop("Required R packages failed to install")'

COPY inference/ ./inference/
COPY run_registry_api.sh ./run_registry_api.sh

RUN chmod +x ./run_registry_api.sh

ENV HOST=0.0.0.0
ENV PORT=8000
ENV MODEL_CACHE_DIR=/models

EXPOSE 8000

CMD ["./run_registry_api.sh"]

FROM runtime AS test

# Tests are already copied via `COPY inference/` above.

RUN Rscript inference/tests/test_serialization.R
RUN Rscript inference/tests/test_compact_score.R

FROM runtime AS final
