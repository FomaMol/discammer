#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# indexnow-ping.sh — notify IndexNow of changed URLs (SEO-3)
# =============================================================================
# Called from deploy.sh AFTER a successful health probe so Bing/Yandex re-crawl
# fresh content promptly (IndexNow is a free, instant-indexing ping supported by
# Bing, Yandex, Seznam, Naver, and others; Google does not consume it).
#
# Ownership proof: the engines only accept a submission when the origin serves
# `<key>.txt` at the site root with the key as its body. That file is served by
# the FastAPI route `GET /<key>.txt` (backend/routers/seo.py), gated on the same
# INDEXNOW_KEY env this script uses — so if the key isn't provisioned, both the
# file and this ping are simply absent (no half-configured state).
#
# ── Required env ─────────────────────────────────────────────────────────────
#   INDEXNOW_KEY   8–128 chars [a-zA-Z0-9-]; the shared ownership key.
#
# ── Optional env ─────────────────────────────────────────────────────────────
#   SITE_ORIGIN            default https://discammer.com
#   INDEXNOW_HOST          default: the host parsed from SITE_ORIGIN
#   INDEXNOW_KEY_LOCATION  default $SITE_ORIGIN/$INDEXNOW_KEY.txt
#   INDEXNOW_URLS          explicit space/comma-separated URL list; when set it
#                          overrides the sitemap-derived list below.
#   INDEXNOW_MAX_URLS      cap on URLs per submission (default 1000; API max is
#                          10000). Keeps a huge sitemap from a giant request.
#   INDEXNOW_ENDPOINT      default https://api.indexnow.org/indexnow
#   RUN_STRICT             1 = exit non-zero on a real API error (default 0 =
#                          best-effort; deploy.sh calls it non-strict).
#
# Best-effort by contract: if INDEXNOW_KEY is unset/malformed it SKIPS (exit 0)
# so a deploy on a box without IndexNow configured still succeeds.
#
# Usage:
#   INDEXNOW_KEY=... scripts/indexnow-ping.sh
#   INDEXNOW_KEY=... INDEXNOW_URLS="https://discammer.com/en/ https://discammer.com/ru/" scripts/indexnow-ping.sh
# =============================================================================

INDEXNOW_KEY="${INDEXNOW_KEY:-}"
SITE="${SITE_ORIGIN:-https://discammer.com}"
SITE="${SITE%/}"
ENDPOINT="${INDEXNOW_ENDPOINT:-https://api.indexnow.org/indexnow}"
MAX_URLS="${INDEXNOW_MAX_URLS:-1000}"
RUN_STRICT="${RUN_STRICT:-0}"

log() { echo "[indexnow] $*"; }
skip_or_fail() {
  # Non-strict: warn + exit 0 (deploy stays green). Strict: exit 1.
  log "$1"
  [ "$RUN_STRICT" = "1" ] && exit 1 || exit 0
}

# Validate the key the same way the FastAPI route does: 8–128 chars, [a-zA-Z0-9-].
if [ -z "$INDEXNOW_KEY" ]; then
  skip_or_fail "INDEXNOW_KEY not set — skipping IndexNow ping (fine if IndexNow isn't wired yet)."
fi
if ! printf '%s' "$INDEXNOW_KEY" | grep -Eq '^[a-zA-Z0-9-]{8,128}$'; then
  skip_or_fail "INDEXNOW_KEY is malformed (need 8–128 chars of [a-zA-Z0-9-]) — skipping."
fi
command -v curl >/dev/null 2>&1 || skip_or_fail "curl not installed — skipping ping."

# Host + key location.
HOST="${INDEXNOW_HOST:-}"
if [ -z "$HOST" ]; then
  # Strip scheme and any path/port to get the bare host.
  HOST="${SITE#*://}"
  HOST="${HOST%%/*}"
  HOST="${HOST%%:*}"
fi
KEY_LOCATION="${INDEXNOW_KEY_LOCATION:-$SITE/$INDEXNOW_KEY.txt}"

# ── Resolve the URL list ─────────────────────────────────────────────────────
# Precedence: explicit INDEXNOW_URLS → live sitemap → a small static fallback.
urls=""
if [ -n "${INDEXNOW_URLS:-}" ]; then
  urls="$(echo "$INDEXNOW_URLS" | tr ',' ' ')"
  log "Using explicit INDEXNOW_URLS."
else
  log "Deriving URL list from $SITE/sitemap.xml ..."
  sitemap="$(curl -fsS --max-time 20 "$SITE/sitemap.xml" 2>/dev/null || true)"
  if [ -n "$sitemap" ]; then
    # Extract <loc>...</loc> values. Our sitemap emits absolute https URLs.
    urls="$(printf '%s' "$sitemap" \
      | grep -oE '<loc>[^<]+</loc>' \
      | sed -E 's,</?loc>,,g' \
      | head -n "$MAX_URLS" || true)"
  fi
  if [ -z "$urls" ]; then
    log "Sitemap unavailable/empty — falling back to top-level surfaces."
    urls="$SITE/ $SITE/en/ $SITE/ru/"
  fi
fi

# Normalize whitespace and cap the count.
urls="$(printf '%s\n' $urls | sed '/^$/d' | head -n "$MAX_URLS")"
count="$(printf '%s\n' "$urls" | sed '/^$/d' | wc -l | tr -d ' ')"
if [ "${count:-0}" -eq 0 ]; then
  skip_or_fail "No URLs to submit — skipping."
fi

# ── Build the JSON body ──────────────────────────────────────────────────────
# The URLs are our own (from our sitemap / owner-supplied), not user input, so a
# straightforward join is safe. Emit one quoted element per line.
json_urls="$(printf '%s\n' "$urls" | sed '/^$/d' | sed 's/.*/"&"/' | paste -sd, -)"
body="$(cat <<JSON
{"host":"$HOST","key":"$INDEXNOW_KEY","keyLocation":"$KEY_LOCATION","urlList":[$json_urls]}
JSON
)"

log "Submitting $count URL(s) for host $HOST to $ENDPOINT"
# curl always prints the code via -w (000 on a connection failure) but exits
# non-zero on transport errors; `|| true` keeps that from aborting under set -e
# without double-appending a second code.
http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  -X POST "$ENDPOINT" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data "$body" 2>/dev/null || true)"
http_code="${http_code:-000}"

# IndexNow returns 200 (OK) or 202 (Accepted, pending validation). Anything else
# (403 = key not verified yet, 422 = URLs don't match host, 429 = too many) is a
# soft failure here.
case "$http_code" in
  200|202) log "IndexNow accepted the submission (HTTP $http_code)." ;;
  *)       skip_or_fail "IndexNow returned HTTP $http_code (soft failure)." ;;
esac
