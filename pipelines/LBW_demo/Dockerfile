FROM rocker/r-ver:4.6.0

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends awscli ca-certificates libcurl4-openssl-dev libsodium-dev \
  && rm -rf /var/lib/apt/lists/*

RUN R -q -e 'install.packages(c("dlnm", "plumber", "jsonlite"), repos = "https://cloud.r-project.org")'

COPY inference/ ./inference/
COPY web/ ./web/
COPY start.sh ./start.sh

RUN chmod +x ./start.sh

ENV HOST=0.0.0.0
ENV PORT=8000
ENV LBW_MODEL_DIR=/models

EXPOSE 8000

CMD ["./start.sh"]
