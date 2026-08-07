FROM rocker/r-ver:4.6.0 AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl libcurl4-openssl-dev libicu-dev libsodium-dev unzip zlib1g-dev \
  && arch="$(uname -m)" \
  && case "$arch" in \
    x86_64|aarch64) aws_cli_arch="$arch" ;; \
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_cli_arch}.zip" -o /tmp/awscliv2.zip \
  && unzip -q /tmp/awscliv2.zip -d /tmp \
  && /tmp/aws/install \
  && rm -rf /tmp/aws /tmp/awscliv2.zip /var/lib/apt/lists/*

RUN R -q -e 'packages <- c("dlnm", "plumber", "jsonlite"); install.packages(packages, repos = "https://cloud.r-project.org"); if (!all(vapply(packages, requireNamespace, logical(1), quietly = TRUE))) stop("Required R packages failed to install")'

COPY inference/ ./inference/
COPY web/ ./web/
COPY start.sh ./start.sh

RUN chmod +x ./start.sh

ENV HOST=0.0.0.0
ENV PORT=8000
ENV LBW_MODEL_DIR=/models

EXPOSE 8000

CMD ["./start.sh"]

FROM runtime AS test

COPY tests/test_serialization.R ./tests/test_serialization.R

RUN Rscript tests/test_serialization.R

FROM runtime AS final
