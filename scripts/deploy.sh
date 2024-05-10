#!/usr/bin/env bash
set -euo pipefail

main() {
  local repo_dir="${REPO_DIR:-/opt/discammer}"
  local compose="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

  cd "$repo_dir"

  git lfs install --local

  git fetch --prune origin main
  git reset --hard origin/main

  # `git reset --hard` only checks out LFS pointer files; pull the real Unity
  # WebGL brotli binaries before the Docker build copies them into the image.
  git lfs pull

  # Tag the currently running image as :prev so we can roll back if the new
  # build starts but the app inside is broken. Tagged images are immune to
  # `docker image prune` (which only removes dangling ones).
  local image image_base
  image="$($compose config --images 2>/dev/null | head -1 || true)"
  if [ -n "$image" ]; then
    image_base="${image%%:*}"
    if docker image inspect "$image" >/dev/null 2>&1; then
      docker tag "$image" "${image_base}:prev"
    fi
  fi

  # --pull refreshes the base-image layers (node:20-slim / python:3.12-slim)
  # so OS security patches actually reach prod.
  $compose build --pull
  $compose up -d

  # In-script health probe: `up -d` exits 0 even if the app crash-loops.
  # Probe the localized home page; on failure restore :prev and fail loudly.
  local ok=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -fsSL --max-time 10 -o /dev/null http://127.0.0.1:8000/en/; then
      ok=1
      break
    fi
    sleep 5
  done

  if [ -z "$ok" ]; then
    echo "Health probe failed after deploy" >&2
    if [ -n "${image_base:-}" ] && docker image inspect "${image_base}:prev" >/dev/null 2>&1; then
      echo "Rolling back to ${image_base}:prev" >&2
      docker tag "${image_base}:prev" "$image"
      $compose up -d --no-build
    fi
    exit 1
  fi

  # Healthy: prune dangling leftovers older than 24h. The :prev tag keeps the
  # rollback candidate safe regardless of age.
  docker image prune -f --filter "until=24h"
}

main "$@"
