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

# SEC-1/SEC-4 — assert security headers on the live HTML before the Playwright
# pass. The always-on hardening headers are FATAL if missing (a regression in
# backend/security.py or a stale image). The CSP is reported as a warning only,
# since it is env-toggleable (CSP_ENABLED) and rolls out Report-Only first.
check_security_headers() {
  local url="${BASE_URL}/en/"
  echo "[smoke-prod] checking security headers on ${url} ..."
  local hdrs
  hdrs="$(curl -fsSL -D - -o /dev/null --max-time 15 "$url" | tr 'A-Z' 'a-z')" || {
    echo "[smoke-prod] ERROR: could not fetch ${url} for header check" >&2
    return 1
  }
  local missing=()
  for h in x-frame-options x-content-type-options referrer-policy permissions-policy; do
    grep -qi "^${h}:" <<< "$hdrs" || missing+=("$h")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    echo "[smoke-prod] ERROR: missing required security headers: ${missing[*]}" >&2
    return 1
  fi
  if grep -qiE '^content-security-policy(-report-only)?:' <<< "$hdrs"; then
    echo "[smoke-prod] CSP present ($(grep -oiE 'content-security-policy(-report-only)?' <<< "$hdrs" | head -1))."
  else
    echo "[smoke-prod] WARNING: no CSP header (CSP_ENABLED off?)." >&2
  fi
  echo "[smoke-prod] security headers OK."
}
check_security_headers

# The game is embedded same-origin by /{lang}/game. A generic security-header
# check on /en/ cannot catch X-Frame-Options: DENY on the framed /play/ document,
# which renders as "refused to connect" in Chrome. Keep this probe deliberately
# read-only and independent of the large Unity payload.
check_game_embed_headers() {
  local url="${BASE_URL}/play/"
  echo "[smoke-prod] checking game embed headers on ${url} ..."
  local hdrs
  hdrs="$(curl -fsSL -D - -o /dev/null --max-time 15 "$url" | tr 'A-Z' 'a-z')" || {
    echo "[smoke-prod] ERROR: could not fetch ${url} for game embed check" >&2
    return 1
  }
  if ! grep -qE '^x-frame-options:[[:space:]]*sameorigin[[:space:]]*$' <<< "$hdrs"; then
    echo "[smoke-prod] ERROR: ${url} must answer X-Frame-Options: SAMEORIGIN" >&2
    return 1
  fi
  echo "[smoke-prod] game embed headers OK."
}
check_game_embed_headers

echo "[smoke-prod] running @smoke specs (read-only) ..."

# E2E_BASE_URL routes the Playwright config at the external origin and SKIPS the
# local uvicorn webServer (we must NOT boot a server when smoking prod).
# --grep @smoke selects only the production-safe slice across the spec files.
E2E_BASE_URL="${BASE_URL}" \
SMOKE_EXPECT_SHA="${SMOKE_EXPECT_SHA:-}" \
exec npx playwright test --grep @smoke "$@"
