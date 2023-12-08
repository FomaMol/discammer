#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/discammer}"

cd "$REPO_DIR"

git fetch --prune origin main
git reset --hard origin/main

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Keep the most recent dangling image as a rollback candidate; prune older
# leftovers (anything created more than 24h ago). If the new container starts
# misbehaving you still have ONE prior image locally to manually `docker tag`
# and bring back. Adjust the window if your deploys are less frequent.
docker image prune -f --filter "until=24h"
