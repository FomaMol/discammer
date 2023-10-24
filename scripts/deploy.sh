#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/discammer}"

cd "$REPO_DIR"

git fetch --prune origin main
git reset --hard origin/main

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f
