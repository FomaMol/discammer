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

# NOTE (A7 deferred to v5): the container runs as root, matching the proven
# prod behavior. A non-root user was prepared in v4 but pulled before release —
# the bind-mounted ./data volume is root-owned on the host, so a non-root
# process can't create discammer.db without a manual `chown`, and that couldn't
# be validated locally (no Docker here). Re-introduce it via a root entrypoint
# that chowns /app/data then drops privileges (gosu/su-exec), tested in CI's
# dockerized e2e job before relying on it.

EXPOSE 8000
WORKDIR /app/backend
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
