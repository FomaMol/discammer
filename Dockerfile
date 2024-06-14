FROM node:20-slim AS frontend-build
WORKDIR /app
# Dependency layer first so source edits don't re-download the npm tree.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
COPY backend/static/ ./backend/static/
# Tailwind v4 scans backend/templates/**/*.html via `@source` in globals.css —
# without these, classes used only in Jinja templates get purged from the bundle.
COPY backend/templates/ ./backend/templates/
RUN cd frontend && npm run build

FROM python:3.12-slim
WORKDIR /app

# Build identifier surfaced by /api/health. The deploy pipeline passes the
# short git SHA as a build-arg; it flows into the runtime env so config.GIT_SHA
# picks it up.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY content/ ./content/
COPY --from=frontend-build /app/backend/static/ ./backend/static/
RUN mkdir -p /app/data

# Non-root at runtime (A7). Install gosu, create an unprivileged `app` user, and
# use an entrypoint that — running as root — makes the bind-mounted /app/data
# writable by `app`, then drops to `app` via gosu before exec'ing uvicorn. This
# is self-healing: no host-side chown of the data volume is required, so it
# works in CI, local compose, and prod identically. We intentionally do NOT set
# `USER app` (the entrypoint must start as root to fix the volume ownership).
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 app \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
WORKDIR /app/backend
# HEALTHCHECK runs as the container's default user (root) — fine; the main app
# process is dropped to `app` by the entrypoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
