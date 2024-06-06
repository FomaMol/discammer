#!/usr/bin/env bash
#
# Local E2E runner for the DiScammer Playwright harness (Task Q1).
#
# Installs the e2e deps and runs the Playwright suite. With no E2E_BASE_URL set,
# the Playwright config's `webServer` boots the FastAPI app via the venv's
# uvicorn (main:app, --app-dir backend) on 127.0.0.1:8000, waits for
# /api/health, runs the tests, then tears the server down.
#
# Usage:
#   bash scripts/e2e.sh                 # run the whole suite
#   bash scripts/e2e.sh smoke.spec.ts   # run one spec
#   bash scripts/e2e.sh --ui            # any extra args pass straight through
#
# Run against an already-running origin (skips the managed server):
#   E2E_BASE_URL=http://127.0.0.1:8000 bash scripts/e2e.sh
set -euo pipefail

# Resolve the repo root from this script's location so it works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}/e2e"

echo "[e2e] installing dependencies (e2e/) ..."
npm install --silent

echo "[e2e] running Playwright ..."
npx playwright test "$@"
