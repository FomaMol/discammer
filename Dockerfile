FROM node:20-slim AS frontend-build
WORKDIR /app
# Dependency layer first so source edits don't re-download the npm tree.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
COPY backend/static/ ./backend/static/
# Frontend data tests import the authored locale JSON during the typecheck.
COPY backend/locales/ ./backend/locales/
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

# gosu lets the root entrypoint drop privileges cleanly (no TTY/signal/PID
# quirks of su) before exec'ing uvicorn. Debian ships it in the archive.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
# Fail the image build on missing assets, LFS pointers, or altered vendor bytes.
RUN python backend/verify_game_build.py
COPY content/ ./content/
COPY --from=frontend-build /app/backend/static/ ./backend/static/
RUN mkdir -p /app/data

# Non-root container (A1), done right. We create the app account but the image
# still STARTS as root (no `USER app`) so the entrypoint can chown the
# root-owned bind-mounted /app/data at runtime, THEN drop to the app uid:gid via
# gosu. A bare `USER app` was the v4 bug: a build-time chown is overridden at
# runtime by the host's root-owned ./data, so the seed could not write
# discammer.db. APP_UID/APP_GID are overridable to align with a host volume
# owner; gosu uses the numeric ids so a passwd/uid mismatch is harmless.
ARG APP_UID=10001
ARG APP_GID=10001
RUN groupadd --gid "$APP_GID" app \
  && useradd --uid "$APP_UID" --gid "$APP_GID" --no-create-home --shell /usr/sbin/nologin app \
  && chown -R "$APP_UID:$APP_GID" /app
ENV APP_UID=$APP_UID APP_GID=$APP_GID

COPY scripts/docker-entrypoint.sh /app/scripts/docker-entrypoint.sh
RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 8000
WORKDIR /app/backend
# start-period covers the cold-start work before the app can serve: the
# entrypoint chown + the lifespan init_db + the full wipe-and-reseed (incl. the
# FTS index build). 45s (was 15s) gives generous margin so a slow seed under
# load isn't reported `unhealthy` mid-boot. Failures during start-period never
# count toward the unhealthy verdict, so this only delays the FIRST real check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
# Image starts as root → entrypoint chowns /app/data → gosu drops to APP_UID →
# exec's this CMD. Keep --no-access-log (v4).
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
