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
# discammer.db here). Create it if missing, then align ownership to the app
# uid:gid. -R covers a pre-existing db/journal left by an earlier run.
mkdir -p /app/data
chown -R "${APP_UID}:${APP_GID}" /app/data

# Drop root and hand off to the CMD (uvicorn). Numeric uid:gid avoids depending
# on a passwd lookup matching APP_UID.
exec gosu "${APP_UID}:${APP_GID}" "$@"
