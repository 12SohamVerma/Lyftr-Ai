# syntax=docker/dockerfile:1

# ---- Stage 1: build a self-contained virtualenv with the pinned dependencies ----
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install -r /tmp/requirements.txt \
    && find /opt/venv -type d -name "__pycache__" -prune -exec rm -rf {} + \
    && find /opt/venv -type d \( -name "tests" -o -name "test" \) -path "*/site-packages/*" -prune -exec rm -rf {} +

# ---- Stage 2: slim runtime (no compilers, no pip cache, no test deps) ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    LITELLM_MODE=PRODUCTION \
    LITELLM_LOCAL_MODEL_COST_MAP=True \
    DATABASE_URL=sqlite:////data/app.db \
    PORT=8000

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --no-create-home app \
    && mkdir -p /data \
    && chown app:app /data

COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY --chown=app:app app ./app
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 8000

# Healthy only when GET /health returns 200 (DB reachable, >=2 keys, cache on).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request as r; r.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health', timeout=4)" || exit 1

# The entrypoint fixes /data ownership when a platform mounts a root-owned disk,
# then drops privileges: uvicorn always runs as the unprivileged `app` user.
ENTRYPOINT ["docker-entrypoint.sh"]
# One worker on purpose: SQLite + the per-session locks live in one process.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
