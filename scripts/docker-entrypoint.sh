#!/bin/sh
# Self-healing non-root entrypoint (A1).
#
# The container IMAGE starts as root so this script can fix ownership of the one
# writable path (/app/data, usually a root-owned bind-mount on the host), then
# drops privileges to the app uid:gid via gosu before exec'ing uvicorn. This is
# why a bare `USER app` was wrong: a build-time chown is overridden at runtime
# by the host's root-owned bind-mount, so a non-root process couldn't create
# discammer.db, the seed failed, /api/health went 503, and deploy rolled back.
#
# Idempotent: re-chowning an already-correct data/ is a no-op. Numeric uid:gid
# is used for both chown and gosu so it works even if the baked passwd entry's
# uid differs from APP_UID at runtime.
set -eu

APP_UID="${APP_UID:-10001}"
APP_GID="${APP_GID:-10001}"

# /app/data is the only path the running process must write (SQLite seed writes
# discammer.db here). Preserve the root-owned course rollback snapshots across
# restarts; recursive chown would make them inaccessible to the release script
# and writable by the serving application UID.
mkdir -p /app/data
SNAPSHOT_DIR=/app/data/course-release-snapshots
if [ -L "$SNAPSHOT_DIR" ] || { [ -e "$SNAPSHOT_DIR" ] && [ ! -d "$SNAPSHOT_DIR" ]; }; then
  echo "unsafe course snapshot directory" >&2
  exit 1
fi
if [ -d "$SNAPSHOT_DIR" ]; then
  chown "${APP_UID}:${APP_GID}" /app/data
  find /app/data -mindepth 1 -maxdepth 1 ! -name course-release-snapshots \
    -exec chown -R "${APP_UID}:${APP_GID}" {} +
else
  chown -R "${APP_UID}:${APP_GID}" /app/data
fi

# Drop root and hand off to the CMD (uvicorn). Numeric uid:gid avoids depending
# on a passwd lookup matching APP_UID.
exec gosu "${APP_UID}:${APP_GID}" "$@"
