FROM python:3.12-slim-bookworm@sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_CACHE_DIR=/app/.runtime/uv-cache \
    EDU_DATA_DIR=/app/.data \
    EDU_TESSDATA_DIR=/app/.runtime/tessdata \
    EDU_AI_MODE=local \
    EDU_EXTRACTION_WORKERS=1 \
    PORT=8000

# CA opcional para builds detrás de un proxy corporativo; no se conserva en la imagen.
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv==0.12.23 \
    && useradd --create-home --uid 10001 isla \
    && mkdir -p /app \
    && chown isla:isla /app

WORKDIR /app
COPY --chown=isla:isla pyproject.toml uv.lock ./
COPY --chown=isla:isla scripts/ ./scripts/
COPY --chown=isla:isla app/ ./app/
USER isla
RUN --mount=type=secret,id=build_ca,uid=10001,gid=10001 \
    if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca CURL_CA_BUNDLE=/run/secrets/build_ca; fi; \
    bash scripts/setup.sh --no-dev \
    && rm -rf /app/.runtime/uv-cache

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/health',timeout=3).close()"
CMD ["bash", "scripts/start.sh"]
