#!/usr/bin/env bash
#
# Post-deploy production smoke (Task O3).
#
# Runs the @smoke-tagged Playwright specs against a LIVE origin. READ-ONLY: the
# tagged tests are plain GETs + passive assertions (every top-level page 200,
# /api/health reports the deployed version, zero console errors, >=1 island
# hydrates). No writes, no analyzer/URL-input flows (privacy — we never submit
# user-content fields to a real box).
#
# This does NOT roll back on failure — deploy.sh already has the in-box :prev
# rollback. A red smoke run marks the CI run failed so a human looks.
#
# Usage:
#   scripts/smoke-prod.sh                                   # default: prod
#   BASE_URL=https://discammer.com scripts/smoke-prod.sh    # explicit prod
#   BASE_URL=http://127.0.0.1:8000 scripts/smoke-prod.sh    # local dev (exercise the script)
#
# Pin the smoke run to a specific deployed commit (CI passes the just-deployed
# short SHA so the run proves the box swapped images, not a stale cache):
#   SMOKE_EXPECT_SHA=abc1234 BASE_URL=https://discammer.com scripts/smoke-prod.sh
#
# Extra args pass straight through to `playwright test`:
#   scripts/smoke-prod.sh --reporter=line
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BASE_URL="${BASE_URL:-https://discammer.com}"

cd "${REPO_ROOT}/e2e"

# Install deps if Playwright isn't present yet (no-op when already installed).
if [ ! -d node_modules/@playwright/test ]; then
  echo "[smoke-prod] installing e2e dependencies ..."
  npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1
fi

echo "[smoke-prod] target:    ${BASE_URL}"
echo "[smoke-prod] expect SHA: ${SMOKE_EXPECT_SHA:-<unset; any non-empty version passes>}"
echo "[smoke-prod] running @smoke specs (read-only) ..."

# E2E_BASE_URL routes the Playwright config at the external origin and SKIPS the
# local uvicorn webServer (we must NOT boot a server when smoking prod).
# --grep @smoke selects only the production-safe slice across the spec files.
E2E_BASE_URL="${BASE_URL}" \
SMOKE_EXPECT_SHA="${SMOKE_EXPECT_SHA:-}" \
exec npx playwright test --grep @smoke "$@"
