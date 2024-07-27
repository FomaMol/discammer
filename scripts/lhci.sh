#!/usr/bin/env bash
#
# Lighthouse CI runner for DiScammer (Task Q2).
#
# Runs @lhci/cli (pinned in lighthouserc.json's expectation; invoked via npx)
# against the served app and asserts the budgets in ../lighthouserc.json. The
# floors there are a RATCHET: they sit at (slightly below) the current measured
# category scores so the gate can only hold or improve.
#
# URL set: /, /check, /inspect, and a guide (/en/guide/phishing) — declared in
# lighthouserc.json under ci.collect.url. This script only points lhci at the
# right base origin + Chrome binary; the URLs and assertions live in the config.
#
# Usage:
#   scripts/lhci.sh                                  # default: local stack
#   BASE_URL=http://127.0.0.1:8000 scripts/lhci.sh   # explicit local origin
#   BASE_URL=https://discammer.com scripts/lhci.sh   # against prod (read-only)
#
# Pass extra flags straight through to `lhci autorun`:
#   scripts/lhci.sh --collect.numberOfRuns=1
#
# Chrome resolution (in order): $CHROME_PATH if set; else the Playwright-managed
# "Google Chrome for Testing" in the ms-playwright cache (matches the e2e
# browser); else system Google Chrome. lhci needs a real Chrome to drive.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
LHCI_VERSION="0.15.1"

# --- Resolve a Chrome binary ------------------------------------------------
resolve_chrome() {
  if [ -n "${CHROME_PATH:-}" ] && [ -x "${CHROME_PATH}" ]; then
    echo "${CHROME_PATH}"
    return 0
  fi
  # Prefer the Playwright-managed Chrome for Testing (same engine as the e2e
  # job). Pick the highest-numbered chromium-* dir.
  local pw_cache="${HOME}/Library/Caches/ms-playwright"
  if [ -d "${pw_cache}" ]; then
    local candidate
    candidate="$(find "${pw_cache}" -type f \
      \( -name 'Google Chrome for Testing' -o -name 'chrome' \) 2>/dev/null \
      | sort | tail -1)"
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  fi
  # Linux Playwright cache layout (CI / docker).
  if [ -d "${HOME}/.cache/ms-playwright" ]; then
    local lin
    lin="$(find "${HOME}/.cache/ms-playwright" -type f -name 'chrome' 2>/dev/null | sort | tail -1)"
    if [ -n "${lin}" ] && [ -x "${lin}" ]; then
      echo "${lin}"
      return 0
    fi
  fi
  # System fallbacks.
  for sys in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/usr/bin/google-chrome" \
    "/usr/bin/chromium" \
    "/usr/bin/chromium-browser"; do
    if [ -x "${sys}" ]; then
      echo "${sys}"
      return 0
    fi
  done
  return 1
}

if ! CHROME_BIN="$(resolve_chrome)"; then
  echo "[lhci] ERROR: no Chrome binary found. Set CHROME_PATH or run 'npx playwright install chromium' in e2e/." >&2
  exit 1
fi
export CHROME_PATH="${CHROME_BIN}"
echo "[lhci] using Chrome: ${CHROME_PATH}"
echo "[lhci] base URL:    ${BASE_URL}"

# The 4 audited surfaces (paths). Kept in lockstep with lighthouserc.json's
# ci.collect.url. We rebuild the absolute URLs from BASE_URL and pass them as
# --collect.url flags, which OVERRIDE the config's urls — that's how a custom
# BASE_URL (a different port, or prod) gets audited without editing the JSON.
PATHS=("/en/" "/en/check" "/en/inspect" "/en/guide/phishing")
URL_FLAGS=()
for p in "${PATHS[@]}"; do
  URL_FLAGS+=("--collect.url=${BASE_URL%/}${p}")
done

cd "${REPO_ROOT}"
echo "[lhci] auditing: ${PATHS[*]}"
echo "[lhci] running @lhci/cli@${LHCI_VERSION} autorun ..."
exec npx --yes "@lhci/cli@${LHCI_VERSION}" autorun \
  --config="${REPO_ROOT}/lighthouserc.json" \
  "${URL_FLAGS[@]}" \
  "$@"
