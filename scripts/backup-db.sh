#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# DiScammer SQLite off-site backup (REL-1).
#
# WHY this exists: the content tables (post / scam_guide / course_module) are
# wiped+reseeded from git on every startup, so they are disposable. But the DB
# file is the ONLY stateful path on the box and any FUTURE writable table —
# course progress, certificates, sync state — would be IRREPLACEABLE. A disk
# loss today is cheap to recover (re-deploy); a disk loss after user data lands
# is catastrophic. This script is cheap insurance now and load-bearing later.
#
# WHY `.backup` and never `cp`: the app runs SQLite in WAL mode, so the live
# `.db` is only half the truth — recent writes sit in the `-wal` sidecar and a
# naked `cp data/discammer.db` can capture a torn, un-checkpointed snapshot.
# `sqlite3 ".backup"` uses the online backup API: it reads a transactionally
# consistent image while the app keeps serving, no downtime, no lock contention
# beyond brief page-level reads. `.dump` (SQL text) is the fallback for the rare
# host whose `sqlite3` predates `.backup`.
#
# WHY it must stay lightweight: prod is a 2 vCPU / 2 GB / no-swap VPS. The DB is
# tiny (low single-digit MB), the backup is a sequential read + gzip + one
# upload, so the footprint is negligible — but we still avoid spawning anything
# heavyweight and we never hold the DB open longer than the copy.
#
# Exit codes: 0 = backup produced + verified (+ uploaded if a remote is set).
#             non-zero = a REAL failure (DB missing, integrity_check failed,
#             upload to a configured remote failed). A *missing* remote is a
#             warning, not a failure — we degrade to local-only on purpose.
#
# Env knobs (all optional, sane prod defaults):
#   DB              path to the live SQLite file
#                   (default /opt/discammer/data/discammer.db)
#   BACKUP_DIR      where compressed backups land + are pruned
#                   (default /opt/discammer/backups)
#   BACKUP_REMOTE   off-site target. Auto-detected from the value:
#                     rclone:<remote>:<path>   -> rclone copy
#                     s3://bucket/prefix       -> aws s3 cp
#                     r2:<remote>:<path>       -> rclone copy (alias for rclone:)
#                   Unset/empty -> local-only (warns once, exits 0).
#   RETENTION_DAYS  prune local *.db.gz older than this many days (default 14).
#                   Remote retention is handled by an R2 lifecycle rule — see
#                   docs/ops/backups.md (we do NOT delete remote objects here:
#                   off-site retention living in the bucket survives a bad host).
# ---------------------------------------------------------------------------

DB="${DB:-/opt/discammer/data/discammer.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/discammer/backups}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# A unique-per-run working dir under TMPDIR (default /tmp). mktemp -d avoids
# clobbering a concurrent run and gives us one path to clean up unconditionally.
WORKDIR=""

log()  { echo "[backup-db] $*"; }
warn() { echo "[backup-db] WARN: $*" >&2; }
die()  { echo "[backup-db] ERROR: $*" >&2; exit 1; }

# Always remove the scratch dir, even on failure, so a crashed run never leaves
# a plaintext copy of the DB lying around in /tmp. The trap fires on EXIT.
cleanup() {
  [ -n "$WORKDIR" ] && rm -rf "$WORKDIR" 2>/dev/null || true
}
trap cleanup EXIT

# Require a command or abort with a clear message — never fail silently on a
# missing tool half-way through.
require() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' not found in PATH"
}

# ---- 1. produce a consistent, gzipped snapshot ----------------------------
make_backup() {
  require sqlite3
  require gzip

  [ -f "$DB" ] || die "DB not found at '$DB' (set DB=... or check the bind mount)"

  mkdir -p "$BACKUP_DIR" || die "cannot create BACKUP_DIR '$BACKUP_DIR'"
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/discammer-backup.XXXXXX")" \
    || die "mktemp failed"

  # UTC-agnostic local timestamp; sortable so `ls`/glob ordering == chronological.
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  RAW="${WORKDIR}/discammer-${ts}.db"          # the verified .backup output
  GZ="${BACKUP_DIR}/discammer-${ts}.db.gz"     # the final compressed artifact

  # Online backup API. `.backup` is preferred (binary, fast, exact). If this
  # sqlite3 is too old to know `.backup`, fall back to a `.dump` (SQL text)
  # piped into a fresh DB so the rest of the pipeline (integrity_check, gzip)
  # is identical regardless of which path produced RAW.
  log "snapshotting $DB -> $(basename "$RAW") (WAL-consistent online backup)"
  if ! sqlite3 "$DB" ".timeout 5000" ".backup '${RAW}'" 2>"${WORKDIR}/backup.err"; then
    warn "'.backup' failed ($(tr -d '\n' <"${WORKDIR}/backup.err")); falling back to '.dump'"
    sqlite3 "$DB" ".timeout 5000" ".dump" >"${WORKDIR}/dump.sql" \
      || die "both '.backup' and '.dump' failed — cannot snapshot DB"
    sqlite3 "$RAW" <"${WORKDIR}/dump.sql" \
      || die "rebuilding DB from .dump failed"
  fi
  [ -s "$RAW" ] || die "snapshot produced an empty file — aborting"
}

# ---- 2. verify the snapshot BEFORE we trust/upload it ---------------------
# A backup that doesn't open or fails integrity_check is worse than no backup:
# it gives false confidence. We verify the snapshot itself (not the live DB),
# so we catch corruption introduced by the copy/compress path too.
verify_backup() {
  log "verifying snapshot (PRAGMA integrity_check)"
  local result
  result="$(sqlite3 "$RAW" "PRAGMA integrity_check;" 2>&1 || true)"
  if [ "$result" != "ok" ]; then
    die "integrity_check FAILED on snapshot: ${result} — refusing to upload a bad backup"
  fi
  log "integrity_check: ok"
}

# ---- 3. compress -----------------------------------------------------------
compress_backup() {
  # gzip the verified snapshot into BACKUP_DIR. -9 is fine: the DB is tiny and
  # this is a once-a-day job, so squeeze for the cheapest off-site storage.
  gzip -9 -c "$RAW" >"$GZ" || die "gzip failed writing '$GZ'"
  [ -s "$GZ" ] || die "compressed artifact is empty — aborting"
}

# ---- 4. upload off-site (optional, auto-detected backend) ------------------
# Returns 0 and a human destination string via UPLOAD_DEST. A configured-but-
# failing remote is a HARD failure (we want the cron to alert); an UNconfigured
# remote degrades to local-only with a warning (exit 0).
UPLOAD_DEST="local-only"
upload_backup() {
  if [ -z "$BACKUP_REMOTE" ]; then
    warn "BACKUP_REMOTE not set — keeping backup LOCAL ONLY. Set it for off-site (see docs/ops/backups.md)."
    return 0
  fi

  local base; base="$(basename "$GZ")"
  case "$BACKUP_REMOTE" in
    rclone:*|r2:*)
      # rclone:r2:discammer-backups  /  r2:r2:discammer-backups  -> rclone copy
      require rclone
      local target="${BACKUP_REMOTE#rclone:}"; target="${target#r2:}"
      # `copy` (not sync) so a bad/empty source can never wipe the bucket.
      log "uploading via rclone -> ${target}/${base}"
      rclone copy "$GZ" "$target" \
        || die "rclone upload to '${target}' failed"
      UPLOAD_DEST="rclone:${target}/${base}"
      ;;
    s3://*)
      # s3://bucket/prefix -> aws s3 cp (works against R2's S3-compatible API
      # when AWS_ENDPOINT_URL / --endpoint-url points at the R2 endpoint).
      require aws
      local dest="${BACKUP_REMOTE%/}/${base}"
      log "uploading via aws s3 cp -> ${dest}"
      # Honour AWS_ENDPOINT_URL if the host exports it (R2 endpoint); modern
      # aws-cli reads it automatically, but pass it explicitly when present so
      # older clients also target R2 instead of real AWS S3.
      if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
        aws s3 cp "$GZ" "$dest" --endpoint-url "$AWS_ENDPOINT_URL" \
          || die "aws s3 cp to '${dest}' failed"
      else
        aws s3 cp "$GZ" "$dest" \
          || die "aws s3 cp to '${dest}' failed"
      fi
      UPLOAD_DEST="$dest"
      ;;
    *)
      die "unrecognised BACKUP_REMOTE '${BACKUP_REMOTE}' — expected 'rclone:...', 'r2:...', or 's3://...'"
      ;;
  esac
}

# ---- 5. local retention ----------------------------------------------------
# Prune compressed backups older than RETENTION_DAYS. Scoped to our own
# *.db.gz glob inside BACKUP_DIR so we can never delete anything we didn't
# write. Best-effort: a prune hiccup must not fail an otherwise-good backup.
prune_local() {
  log "pruning local backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'discammer-*.db.gz' \
       -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null \
    || warn "local prune hit an error (non-fatal — backup itself succeeded)"
}

main() {
  make_backup
  verify_backup
  compress_backup
  upload_backup
  prune_local

  # One clear, greppable summary line for cron mail / the deploy log.
  local size; size="$(du -h "$GZ" | cut -f1)"
  local count; count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'discammer-*.db.gz' | wc -l | tr -d ' ')"
  log "DONE: ${GZ} (${size}) -> ${UPLOAD_DEST}; ${count} local backup(s) retained (${RETENTION_DAYS}d)"
}

main "$@"
