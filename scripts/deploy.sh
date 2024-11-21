#!/usr/bin/env bash
set -euo pipefail

# Read-only snapshot of host + container health, printed to the deploy log
# BEFORE we touch anything. This is our window into the box (the agent has no
# direct SSH): it surfaces the things that cause the intermittent flapping —
# an OOM-kill history, a climbing RestartCount, memory/swap pressure, a full
# disk — so each deploy leaves a forensic trail. Every command only reads.
#
# NOTE: the `docker logs --tail` output below is mirrored into the (retained)
# GitHub Actions deploy log. Today the container carries no secret env and the
# app's structured logs hold no PII, so nothing sensitive leaks. If app logging
# ever starts emitting request bodies/headers/tokens, drop or scrub the log
# tail here — otherwise it would surface in CI on every deploy.
preflight_diagnostics() {
  local compose="$1"
  echo "==================== PRE-DEPLOY HOST DIAGNOSTICS ===================="
  echo "----- uptime / load -----";            uptime 2>/dev/null || true
  echo "----- cpus -----";                     nproc 2>/dev/null || true
  echo "----- memory (MB) -----";              free -m 2>/dev/null || true
  echo "----- swap -----";                     swapon --show 2>/dev/null || true
  echo "----- disk -----";                     df -h / /opt 2>/dev/null || true
  local cid; cid="$($compose ps -q web 2>/dev/null || true)"
  echo "----- web container id -----";         echo "${cid:-<none>}"
  if [ -n "$cid" ]; then
    echo "----- restart count / state / OOM flag -----"
    docker inspect -f 'RestartCount={{.RestartCount}} Status={{.State.Status}} OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} StartedAt={{.State.StartedAt}} FinishedAt={{.State.FinishedAt}}' "$cid" 2>/dev/null || true
    echo "----- container resource usage (one shot) -----"
    docker stats --no-stream "$cid" 2>/dev/null || true
    echo "----- container last 60 log lines -----"
    docker logs --tail 60 "$cid" 2>&1 | tail -60 || true
  fi
  echo "----- OOM kills in kernel ring buffer (history) -----"
  { dmesg -T 2>/dev/null || dmesg 2>/dev/null; } | grep -iE 'out of memory|oom-kill|killed process|invoked oom' | tail -25 || echo "(no dmesg access / no OOM recorded)"
  echo "===================================================================="
}

main() {
  local repo_dir="${REPO_DIR:-/opt/discammer}"
  local compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

  cd "$repo_dir"

  # Snapshot the host BEFORE the deploy mutates anything. Never fail the deploy
  # on a diagnostics hiccup — it is observability, not a gate.
  preflight_diagnostics "$compose" || true

  # Materialize LFS objects only when git-lfs is installed. The Unity binaries
  # are currently committed as plain blobs (no `git lfs migrate` has run yet),
  # so this is a no-op today. The guard means a host WITHOUT git-lfs still
  # deploys with the real blobs instead of aborting under `set -e` for no gain.
  if command -v git-lfs >/dev/null 2>&1; then
    git lfs install --local
  fi

  git fetch --prune origin main
  git reset --hard origin/main

  if command -v git-lfs >/dev/null 2>&1; then
    # `git reset --hard` leaves LFS pointer files (once migration happens); pull
    # the real Unity WebGL brotli binaries before the Docker build copies them.
    git lfs pull
  fi

  # Tag the currently running image as :prev so we can roll back if the new
  # build starts but the app inside is broken. Tagged images are immune to
  # `docker image prune` (which only removes dangling ones).
  #
  # Resolve the WEB image explicitly (`--images web`), NOT `--images | head -1`:
  # compose v2 prints one image per service ordered by service name, so a future
  # second service could otherwise sort ahead of `web` and silently mis-tag the
  # rollback target. Scoping to `web` makes the rollback contract robust to that.
  local image image_base
  image="$($compose config --images web 2>/dev/null | head -1 || true)"
  if [ -n "$image" ]; then
    image_base="${image%%:*}"
    if docker image inspect "$image" >/dev/null 2>&1; then
      docker tag "$image" "${image_base}:prev"
    fi
  fi

  # Stamp the image with the deployed commit so /api/health reports it. The
  # docker-compose.yml build.args reads GIT_SHA from the environment.
  export GIT_SHA="$(git rev-parse --short HEAD)"

  # Bake the non-root app uid:gid (10001) into the image as build args. The root
  # entrypoint self-heals ownership of the bind-mounted ./data (chown to this id
  # then gosu-drops to it) on every start, so there is NO manual host `chown` —
  # see docker-compose.prod.yml. Exporting matching defaults here keeps the
  # baked uid and the runtime uid consistent.
  export APP_UID="${APP_UID:-10001}" APP_GID="${APP_GID:-10001}"

  # --pull refreshes the base-image layers (node:20-slim / python:3.12-slim)
  # so OS security patches actually reach prod. A build failure leaves the
  # already-running container untouched (nothing has been recreated yet), so
  # fail loudly WITHOUT a rollback dance — the old container is still serving.
  if ! $compose build --pull; then
    echo "Image build failed — running container left untouched" >&2
    exit 1
  fi

  # Recreate the app. ANY failure from here — a failed `up`, or a failed health
  # probe — rolls back to :prev. (Previously a failed `up -d` would abort under
  # `set -e` before the rollback block ever ran, which could leave the site in a
  # half-recreated state with no rollback.)
  local need_rollback="" reason=""
  if ! $compose up -d; then
    need_rollback=1
    reason="compose up"
  fi

  # In-script health probe: `up -d` exits 0 even if the app crash-loops.
  # Probe the JSON health endpoint (checks DB connectivity + seed).
  if [ -z "$need_rollback" ]; then
    local ok=""
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
      if curl -fsSL --max-time 10 -o /dev/null http://127.0.0.1:8000/api/health; then
        ok=1
        break
      fi
      sleep 5
    done
    if [ -z "$ok" ]; then need_rollback=1; reason="health probe"; fi
  fi

  if [ -n "$need_rollback" ]; then
    echo "Deploy failed (${reason}) — rolling back" >&2
    if [ -n "${image_base:-}" ] && docker image inspect "${image_base}:prev" >/dev/null 2>&1; then
      echo "Restoring ${image_base}:prev" >&2
      docker tag "${image_base}:prev" "$image"
      # `|| true` so a partial failure here still reaches the loud `exit 1`.
      $compose up -d --no-build || true
      # Re-probe so the deploy log states unambiguously whether :prev came back
      # up. Without this the rollback was fire-and-forget and a half-failed
      # recreate could leave the site dark with no in-box signal.
      local restored=""
      for _ in 1 2 3 4 5 6; do
        if curl -fsSL --max-time 10 -o /dev/null http://127.0.0.1:8000/api/health; then
          restored=1
          break
        fi
        sleep 5
      done
      if [ -n "$restored" ]; then
        echo "Rollback OK — :prev is serving /api/health" >&2
      else
        echo "ROLLBACK DID NOT RECOVER — site may be DOWN, manual intervention needed" >&2
      fi
    else
      echo "No :prev image to roll back to (first deploy?) — site may be DOWN" >&2
    fi
    exit 1
  fi

  # Healthy: prune dangling leftovers older than 24h. The :prev tag keeps the
  # rollback candidate safe regardless of age. Best-effort: a daemon hiccup here
  # must NOT fail the deploy job — the site is already up and serving.
  docker image prune -f --filter "until=24h" \
    || echo "image prune failed (non-fatal — site is healthy)" >&2
}

main "$@"
