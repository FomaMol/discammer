#!/bin/sh
# Self-healing non-root startup (A7).
#
# The app writes its SQLite DB (and the .seed.lock) to /app/data, which is a
# bind-mounted volume. Bind mounts come up owned by the host directory's owner
# (typically root), so a process running as the unprivileged `app` user can't
# create discammer.db there. We start as root, make just that directory writable
# by `app`, then drop privileges via gosu and exec the real command. No
# host-side `chown` of the data volume is required — this is the whole point.
set -e

mkdir -p /app/data
# Only the data dir needs to be app-writable; the rest of /app stays root-owned
# and read-only to the app process (defense in depth).
chown -R app:app /app/data

exec gosu app "$@"
