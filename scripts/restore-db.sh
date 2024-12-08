#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# DiScammer SQLite restore (REL-1, companion to backup-db.sh).
#
# WHY this is deliberately cautious: restoring overwrites the ONE irreplaceable
# path on the box (the live DB). A fat-fingered restore against the wrong file
# is itself a data-loss event. So the contract is:
#
#   * DEFAULT = DRY RUN. Without --yes we only PRINT the plan and verify the
#     backup — we never touch the live DB. You see exactly what would happen.
#   * --yes is required to actually overwrite. And even then we first take a
#     timestamped safety copy of the current DB so an "oops, wrong backup" is
#     recoverable.
#   * We ALWAYS verify the candidate (decompress + PRAGMA integrity_check)
#     before it is allowed anywhere near the live path. Restoring a corrupt
#     backup over a (maybe still readable) live DB would be the worst outcome.
#
# WHY we stop the container around the swap: the app holds the DB open in WAL
# mode. Swapping the file under a running process leaves it reading a deleted
# inode / stale page cache and risks a torn state once it checkpoints. The safe
# order is: stop app -> replace .db -> delete stale -wal/-shm sidecars (they
# belong to the OLD db and would corrupt the NEW one) -> start app (which
# recreates fresh sidecars and reseeds content tables on startup).
#
# Usage:
#   restore-db.sh <backup.db.gz | backup.db | latest>          # DRY RUN
#   restore-db.sh latest --yes                                  # DO IT
#   restore-db.sh /opt/discammer/backups/discammer-...db.gz --yes
#
# `latest` resolves to the newest local *.db.gz in BACKUP_DIR; if none exist
# and BACKUP_REMOTE is set, it pulls the newest object from the remote.
#
# Env knobs:
#   DB              live SQLite path  (default /opt/discammer/data/discammer.db)
#   BACKUP_DIR      where local backups live (default /opt/discammer/backups)
#   BACKUP_REMOTE   remote source for `latest` when no local copy exists
#                   (same formats as backup-db.sh: rclone:/r2:/s3://)
#   COMPOSE         compose invocation used for stop/start notes + actions
#                   (default: docker compose -f docker-compose.yml \
#                                            -f docker-compose.prod.yml)
#   SERVICE         compose service name (default: web)
# ---------------------------------------------------------------------------

DB="${DB:-/opt/discammer/data/discammer.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/discammer/backups}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
SERVICE="${SERVICE:-web}"

WORKDIR=""
APPLY=""        # set to 1 by --yes; empty == dry run
SOURCE_ARG=""   # the positional backup spec

log()  { echo "[restore-db] $*"; }
warn() { echo "[restore-db] WARN: $*" >&2; }
die()  { echo "[restore-db] ERROR: $*" >&2; exit 1; }

cleanup() { [ -n "$WORKDIR" ] && rm -rf "$WORKDIR" 2>/dev/null || true; }
trap cleanup EXIT

require() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' not found in PATH"
}

usage() {
  cat >&2 <<'EOF'
restore-db.sh — DiScammer SQLite restore (dry-run by default)

Usage:
  restore-db.sh <backup.db.gz | backup.db | latest>     # DRY RUN (no changes)
  restore-db.sh latest --yes                            # apply: pull newest + restore
  restore-db.sh /path/to/discammer-...db.gz --yes       # apply a specific backup

`latest` = newest local *.db.gz in BACKUP_DIR, else newest from BACKUP_REMOTE.
Without --yes nothing is touched: the candidate is verified and the plan printed.

Env: DB, BACKUP_DIR, BACKUP_REMOTE, COMPOSE, SERVICE (see docs/ops/backups.md).
EOF
  exit "${1:-0}"
}

parse_args() {
  [ "$#" -ge 1 ] || { usage 1; }
  for arg in "$@"; do
    case "$arg" in
      --yes)        APPLY=1 ;;
      -h|--help)    usage 0 ;;
      --*)          die "unknown flag '$arg'" ;;
      *)
        [ -z "$SOURCE_ARG" ] || die "more than one backup specified ('$SOURCE_ARG' and '$arg')"
        SOURCE_ARG="$arg"
        ;;
    esac
  done
  [ -n "$SOURCE_ARG" ] || die "no backup specified (path or 'latest')"
}

# Resolve `latest` (or pass through an explicit path). Newest LOCAL backup wins;
# only reach for the remote when nothing is local. The resolved file is left in
# RESOLVED (it may live in BACKUP_DIR or in our scratch WORKDIR if pulled).
RESOLVED=""
resolve_source() {
  if [ "$SOURCE_ARG" != "latest" ]; then
    [ -f "$SOURCE_ARG" ] || die "backup file not found: '$SOURCE_ARG'"
    RESOLVED="$SOURCE_ARG"
    return 0
  fi

  # Newest local first. -t sorts by mtime; head -1 = most recent.
  local newest_local=""
  if [ -d "$BACKUP_DIR" ]; then
    newest_local="$(ls -1t "$BACKUP_DIR"/discammer-*.db.gz 2>/dev/null | head -1 || true)"
  fi
  if [ -n "$newest_local" ]; then
    log "latest -> newest LOCAL backup: $newest_local"
    RESOLVED="$newest_local"
    return 0
  fi

  [ -n "$BACKUP_REMOTE" ] \
    || die "'latest' requested but no local backups in '$BACKUP_DIR' and BACKUP_REMOTE is unset"

  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/discammer-restore.XXXXXX")" || die "mktemp failed"
  log "no local backups — pulling newest from remote '$BACKUP_REMOTE'"
  case "$BACKUP_REMOTE" in
    rclone:*|r2:*)
      require rclone
      local target="${BACKUP_REMOTE#rclone:}"; target="${target#r2:}"
      # List by name; backup-db.sh names are sortable so the last line is newest.
      local name
      name="$(rclone lsf "$target" --include 'discammer-*.db.gz' 2>/dev/null | sort | tail -1 || true)"
      [ -n "$name" ] || die "no 'discammer-*.db.gz' objects found at rclone target '$target'"
      log "remote newest: $name"
      rclone copy "${target}/${name}" "$WORKDIR" || die "rclone download failed"
      RESOLVED="${WORKDIR}/${name}"
      ;;
    s3://*)
      require aws
      local bucket_prefix="${BACKUP_REMOTE%/}"
      local ep=(); [ -n "${AWS_ENDPOINT_URL:-}" ] && ep=(--endpoint-url "$AWS_ENDPOINT_URL")
      # `aws s3 ls` prints "<date> <time> <size> <key>"; filter + sort by name.
      local name
      name="$(aws s3 ls "${bucket_prefix}/" "${ep[@]}" 2>/dev/null \
                | awk '{print $NF}' | grep '^discammer-.*\.db\.gz$' | sort | tail -1 || true)"
      [ -n "$name" ] || die "no 'discammer-*.db.gz' objects found at '$bucket_prefix'"
      log "remote newest: $name"
      aws s3 cp "${bucket_prefix}/${name}" "${WORKDIR}/${name}" "${ep[@]}" \
        || die "aws s3 cp download failed"
      RESOLVED="${WORKDIR}/${name}"
      ;;
    *)
      die "unrecognised BACKUP_REMOTE '${BACKUP_REMOTE}'"
      ;;
  esac
}

# Decompress (if .gz) into scratch and integrity-check. Leaves the ready-to-use
# plain .db path in CANDIDATE. Never mutates the live DB.
CANDIDATE=""
prepare_candidate() {
  require sqlite3
  [ -n "$WORKDIR" ] || WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/discammer-restore.XXXXXX")"

  case "$RESOLVED" in
    *.gz)
      require gzip
      CANDIDATE="${WORKDIR}/candidate.db"
      log "decompressing $(basename "$RESOLVED")"
      gzip -dc "$RESOLVED" >"$CANDIDATE" || die "decompression failed"
      ;;
    *)
      # Copy into scratch so integrity_check never opens the original in place.
      CANDIDATE="${WORKDIR}/candidate.db"
      cp "$RESOLVED" "$CANDIDATE" || die "copy of plain backup failed"
      ;;
  esac
  [ -s "$CANDIDATE" ] || die "candidate DB is empty after decompression"

  log "verifying candidate (PRAGMA integrity_check)"
  local result
  result="$(sqlite3 "$CANDIDATE" "PRAGMA integrity_check;" 2>&1 || true)"
  [ "$result" = "ok" ] || die "candidate integrity_check FAILED: ${result} — refusing to restore a bad backup"
  log "integrity_check: ok"
}

# Print the plan (dry run) or execute it (--yes).
do_restore() {
  local size; size="$(du -h "$CANDIDATE" | cut -f1)"
  echo
  log "RESTORE PLAN"
  log "  source backup : ${RESOLVED}"
  log "  verified size : ${size}"
  log "  live DB       : ${DB}"
  log "  compose       : ${COMPOSE} (service: ${SERVICE})"
  echo

  if [ -z "$APPLY" ]; then
    log "DRY RUN — nothing changed. Steps that WOULD run with --yes:"
    log "  1. ${COMPOSE} stop ${SERVICE}"
    log "  2. cp ${DB} ${DB}.pre-restore.<ts>   (safety copy of current live DB)"
    log "  3. cp <verified candidate> ${DB}"
    log "  4. rm -f ${DB}-wal ${DB}-shm         (stale sidecars from the OLD db)"
    log "  5. ${COMPOSE} up -d ${SERVICE}"
    log "Re-run with --yes to apply."
    return 0
  fi

  log "APPLYING restore (--yes given)"

  # 1. Stop the app so nothing holds the DB open during the swap.
  log "stopping ${SERVICE}"
  ${COMPOSE} stop "${SERVICE}" || warn "could not stop ${SERVICE} via compose — ensure it is NOT running before continuing"

  # 2. Safety copy of the CURRENT live DB before we clobber it. This is the
  #    "undo" for a wrong-backup restore. Skip gracefully if there is no live DB
  #    yet (fresh box / first restore).
  if [ -f "$DB" ]; then
    local pre="${DB}.pre-restore.$(date +%Y%m%d-%H%M%S)"
    cp "$DB" "$pre" || warn "could not take pre-restore safety copy (continuing)"
    [ -f "$pre" ] && log "safety copy of current DB -> ${pre}"
  else
    log "no existing live DB at ${DB} — nothing to back up first"
  fi

  # 3. Swap in the verified candidate.
  mkdir -p "$(dirname "$DB")"
  cp "$CANDIDATE" "$DB" || die "failed to copy candidate over live DB — site may be down, restore the .pre-restore copy"
  log "restored DB in place"

  # 4. Remove stale WAL/SHM sidecars. They describe the OLD database; left
  #    behind, SQLite would replay them onto the NEW file and corrupt it.
  rm -f "${DB}-wal" "${DB}-shm" 2>/dev/null || true
  log "removed stale -wal/-shm sidecars"

  # 5. Bring the app back. On startup it reseeds the content tables and creates
  #    fresh WAL sidecars; only the restored writable tables carry over.
  log "starting ${SERVICE}"
  ${COMPOSE} up -d "${SERVICE}" || die "failed to start ${SERVICE} — investigate; the .pre-restore copy is your fallback"

  log "DONE. Verify the site (e.g. curl -fsS http://127.0.0.1:8000/api/health) before deleting the .pre-restore copy."
}

main() {
  parse_args "$@"
  resolve_source
  prepare_candidate
  do_restore
}

main "$@"
