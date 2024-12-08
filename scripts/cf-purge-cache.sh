#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# cf-purge-cache.sh — purge the Cloudflare edge cache (CF-5)
# =============================================================================
# Called from deploy.sh AFTER a successful health probe so a new release isn't
# shadowed by stale edge-cached HTML / non-hashed assets. Content-hashed bundles
# (/static/js/*, /static/css/*) need NO purge — their filenames change every
# build — so this only matters for HTML and any non-hashed asset.
#
# ── Plan-aware purge mode ───────────────────────────────────────────────────
# Cloudflare gates the granular purge types by plan:
#   * purge_everything     — ALL plans (incl. Free)              [default here]
#   * purge by URL (files) — ALL plans (≤30 URLs/request)
#   * purge by prefix/host/tag — ENTERPRISE only
# The FEATURE_PLAN mentions prefix purge, but the project starts on Free, so the
# safe default is `everything`. Because HTML is served `no-cache` and the CF
# cache rule for HTML is Bypass (see SETUP.md), purging everything is cheap and
# correct here: the only cached objects are immutable hashed assets + media,
# which simply repopulate on next request.
#
#   CF_PURGE_MODE=everything   # default
#   CF_PURGE_MODE=files        # purge CF_PURGE_FILES (comma/space separated URLs)
#   CF_PURGE_MODE=prefixes     # Enterprise only; CF_PURGE_PREFIXES
#
# ── Required env (from GitHub Secrets / host env) ───────────────────────────
#   CF_API_TOKEN   scoped token: Zone→Cache Purge→Purge + Zone→Zone→Read
#   CF_ZONE_ID     the discammer.com zone id
#
# Best-effort by contract: if the token/zone are unset it SKIPS (exit 0) so a
# deploy on a box without CF configured still succeeds. A real API error exits
# non-zero only when RUN_STRICT=1 (deploy.sh calls it non-strict / non-fatal).
#
# Usage:
#   CF_API_TOKEN=... CF_ZONE_ID=... scripts/cf-purge-cache.sh
#   CF_PURGE_MODE=files CF_PURGE_FILES="https://discammer.com/en/ https://discammer.com/ru/" scripts/cf-purge-cache.sh
# =============================================================================

CF_API_TOKEN="${CF_API_TOKEN:-}"
CF_ZONE_ID="${CF_ZONE_ID:-}"
CF_PURGE_MODE="${CF_PURGE_MODE:-everything}"
RUN_STRICT="${RUN_STRICT:-0}"
SITE="${SITE_ORIGIN:-https://discammer.com}"

log() { echo "[cf-purge] $*"; }
skip_or_fail() {
  # Non-strict: warn + exit 0 (deploy stays green). Strict: exit 1.
  log "$1"
  [ "$RUN_STRICT" = "1" ] && exit 1 || exit 0
}

if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ]; then
  skip_or_fail "CF_API_TOKEN / CF_ZONE_ID not set — skipping edge purge (this is fine if Cloudflare isn't wired yet)."
fi
command -v curl >/dev/null 2>&1 || skip_or_fail "curl not installed — skipping purge."

# Build the JSON body for the chosen mode.
json_array_from_list() {
  # "a b,c" -> ["a","c"...]  (split on whitespace and commas)
  local items=() it
  for it in $(echo "$1" | tr ',' ' '); do items+=("\"$it\""); done
  local IFS=,; echo "[${items[*]}]"
}

case "$CF_PURGE_MODE" in
  everything)
    body='{"purge_everything":true}'
    ;;
  files)
    files="${CF_PURGE_FILES:-$SITE/ $SITE/en/ $SITE/ru/}"
    body="{\"files\":$(json_array_from_list "$files")}"
    ;;
  prefixes)
    prefixes="${CF_PURGE_PREFIXES:-discammer.com/en/ discammer.com/ru/ discammer.com/static/}"
    body="{\"prefixes\":$(json_array_from_list "$prefixes")}"
    log "NOTE: prefix purge is Enterprise-only; will 400 on Free/Pro."
    ;;
  *)
    skip_or_fail "Unknown CF_PURGE_MODE='$CF_PURGE_MODE' (everything|files|prefixes)."
    ;;
esac

log "Purging zone $CF_ZONE_ID (mode=$CF_PURGE_MODE)"
resp="$(curl -fsS --max-time 20 \
  -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$body" 2>&1)" || skip_or_fail "purge API call failed: $resp"

# Cloudflare returns {"success":true,...} on success.
if echo "$resp" | grep -q '"success":[[:space:]]*true'; then
  log "Edge cache purged OK."
else
  skip_or_fail "purge API returned failure: $resp"
fi
