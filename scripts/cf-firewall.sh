#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# cf-firewall.sh — lock the origin so :80/:443 accept Cloudflare ONLY (CF-8)
# =============================================================================
# After traffic is proxied through Cloudflare, the origin (203.0.113.11) must
# refuse direct web hits — otherwise an attacker bypasses the CF WAF/DDoS shield
# by stuffing requests straight at the IP. This script rebuilds the ufw allow
# list for the web ports from Cloudflare's published edge ranges. Everything
# else to :80/:443 is denied by ufw's default-deny-incoming policy.
#
# RUN THIS LAST in the Cloudflare rollout (see docs/cloudflare/SETUP.md): only
# after `curl -sI https://discammer.com | grep -i server` reports `cloudflare`
# and the site is confirmed serving through CF. Running it before the cutover
# would deny your own browser.
#
# Idempotent: it removes the rules it previously added (tagged by comment) and
# re-adds the current set, so re-running — or a weekly cron refresh as CF ranges
# drift — converges without piling up duplicates.
#
# ── ANTI-LOCKOUT (read this) ────────────────────────────────────────────────
# This script DELIBERATELY does NOT manage SSH (:22). It refuses to proceed
# unless SSH access is already protected, because enabling default-deny while
# locking web ports could otherwise cut your own management access. Provide your
# admin source so the script can verify/ensure an SSH allow rule exists:
#
#   ADMIN_SSH_CIDR=203.0.113.7/32 scripts/cf-firewall.sh
#
# If an SSH allow rule already exists (any rule on 22/tcp), the script proceeds
# without ADMIN_SSH_CIDR but prints a warning. Use APPLY=1 to actually mutate
# ufw; the default is a DRY RUN that prints the planned commands.
#
# Usage:
#   scripts/cf-firewall.sh                          # dry run (prints plan)
#   APPLY=1 ADMIN_SSH_CIDR=<your-ip>/32 scripts/cf-firewall.sh   # apply
#   sudo APPLY=1 scripts/cf-firewall.sh             # if not already root
#
# Cron (weekly refresh; SSH allow must already be persistent):
#   17 4 * * 1 root APPLY=1 /opt/discammer/scripts/cf-firewall.sh >> /var/log/cf-firewall.log 2>&1
# =============================================================================

TAG="cloudflare-edge"                 # ufw rule comment marker (our rules only)
WEB_PORTS=("80" "443")                # ACME (:80) + HTTPS (:443) from CF
APPLY="${APPLY:-0}"                   # 0 = dry run, 1 = mutate ufw
ADMIN_SSH_CIDR="${ADMIN_SSH_CIDR:-}"  # optional admin source for SSH safety
V4_URL="https://www.cloudflare.com/ips-v4"
V6_URL="https://www.cloudflare.com/ips-v6"

log() { echo "[cf-firewall] $*"; }
die() { echo "[cf-firewall] ERROR: $*" >&2; exit 1; }

run() {
  # Echo every mutating command; only execute it when APPLY=1.
  if [ "$APPLY" = "1" ]; then
    echo "  + $*"
    "$@"
  else
    echo "  (dry-run) $*"
  fi
}

command -v ufw >/dev/null 2>&1 || die "ufw not installed (apt-get install ufw)"
command -v curl >/dev/null 2>&1 || die "curl not installed"

if [ "$APPLY" = "1" ] && [ "$(id -u)" != "0" ]; then
  die "APPLY=1 requires root (re-run with sudo)"
fi

# --- anti-lockout: ensure SSH stays reachable -------------------------------
ssh_rule_exists() { ufw status 2>/dev/null | grep -qE '(^|[^0-9])22(/tcp)?[[:space:]].*ALLOW'; }

if [ -n "$ADMIN_SSH_CIDR" ]; then
  log "Ensuring SSH (:22) allowed from $ADMIN_SSH_CIDR before locking web ports"
  run ufw allow from "$ADMIN_SSH_CIDR" to any port 22 proto tcp comment "admin-ssh"
elif ssh_rule_exists; then
  log "WARNING: no ADMIN_SSH_CIDR given; relying on an existing SSH allow rule."
  log "         Confirm you can still reach :22 after applying."
else
  die "No SSH allow rule found and no ADMIN_SSH_CIDR set — refusing to lock the box (anti-lockout). \
Set ADMIN_SSH_CIDR=<your-ip>/32 or add an SSH ufw rule first."
fi

# --- fetch current Cloudflare ranges ----------------------------------------
fetch() {
  curl -fsSL --max-time 20 "$1" | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' || return 1
}
log "Fetching Cloudflare edge ranges"
v4="$(fetch "$V4_URL")" || die "failed to fetch $V4_URL"
v6="$(fetch "$V6_URL")" || die "failed to fetch $V6_URL"
[ -n "$v4" ] && [ -n "$v6" ] || die "empty CF range list — refusing to change the firewall"
ranges="$(printf '%s\n%s\n' "$v4" "$v6")"
log "Got $(echo "$ranges" | grep -c . ) Cloudflare ranges"

# --- remove our previously-added CF rules (idempotency) ---------------------
# Delete by number from highest to lowest so positions don't shift mid-delete.
# Only rules carrying our TAG comment are removed; SSH and unrelated rules are
# never touched.
log "Removing stale '$TAG' rules"
mapfile -t stale_nums < <(ufw status numbered 2>/dev/null | grep "# $TAG" | grep -oE '^\[[ 0-9]+\]' | tr -d '[] ' | sort -rn)
if [ "${#stale_nums[@]}" -eq 0 ]; then
  echo "  (none)"
fi
for n in "${stale_nums[@]}"; do
  if [ "$APPLY" = "1" ]; then
    echo "  + ufw --force delete $n"
    ufw --force delete "$n"
  else
    echo "  (dry-run) ufw delete [$n] (a '$TAG' rule)"
  fi
done

# --- ensure default-deny incoming (so non-CF web hits are dropped) ----------
log "Ensuring default incoming policy is deny"
run ufw default deny incoming
run ufw default allow outgoing

# --- add the current CF allow list for the web ports ------------------------
log "Allowing :${WEB_PORTS[*]} from Cloudflare ranges only"
while IFS= read -r cidr; do
  [ -n "$cidr" ] || continue
  for port in "${WEB_PORTS[@]}"; do
    run ufw allow from "$cidr" to any port "$port" proto tcp comment "$TAG"
  done
done <<< "$ranges"

# --- enable + reload --------------------------------------------------------
if [ "$APPLY" = "1" ]; then
  ufw --force enable
  ufw reload
  log "Applied. Verify from OFF-Cloudflare: a direct 'curl -sI --resolve discammer.com:443:203.0.113.11 https://discammer.com' should hang/refuse, while https://discammer.com (via CF) still serves."
else
  log "DRY RUN complete. Re-run with APPLY=1 (and ADMIN_SSH_CIDR set) to apply."
fi
