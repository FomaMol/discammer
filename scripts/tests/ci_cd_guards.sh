#!/usr/bin/env bash
# CI/CD guard tests. They run the REAL text of .github/workflows/ci-cd.yml, not a
# copy, so a regression in the workflow fails here:
#   1. the top-level token is read-only, and id-token: write (OIDC for the ECR
#      push) appears only in jobs gated to a main push;
#   2. the production SSH deploy script checks the public domain in the same
#      transaction as the editorial update, then restores the exact changed rows
#      and previous image if public verification fails;
#   3. failed apply/health probes restore and re-probe the previous image.
# Nothing here reaches a network, a host or AWS: curl, docker, sudo, aws and sleep
# are stubs on PATH, and /etc/discammer is redirected into a temp directory.
#
# Usage: bash scripts/tests/ci_cd_guards.sh [path/to/ci-cd.yml]
# Needs: bash, ruby (stdlib YAML), coreutils. Exit 0 means every check passed.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="${1:-$ROOT/.github/workflows/ci-cd.yml}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ci-cd-guards.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0
ok()  { pass=$((pass + 1)); echo "PASS  $1"; }
bad() { fail=$((fail + 1)); echo "FAIL  $1"; }

if [ ! -f "$WF" ]; then
  echo "no workflow file: $WF"
  exit 2
fi

# --- read the workflow YAML with ruby (stdlib; PyYAML is not in requirements) --
cat >"$WORK/extract.rb" <<'RUBY'
# usage: extract.rb WF JOB STEP_NAME KEY   (KEY "run", or a key under "with")
require "yaml"
wf, job, step_name, key = ARGV
step = YAML.load_file(wf).fetch("jobs").fetch(job).fetch("steps").find { |s| s["name"] == step_name }
abort "step not found: #{step_name}" unless step
value = key == "run" ? step["run"] : (step["with"] || {})[key]
abort "no #{key} in step #{step_name}" if value.nil?
print value
RUBY

cat >"$WORK/gates.rb" <<'RUBY'
# usage: gates.rb WF. Read-only top-level token; id-token only in main-push jobs.
require "yaml"
wf = YAML.load_file(ARGV[0])
perms = wf["permissions"]
abort "top-level permissions must be exactly {contents: read}, got #{perms.inspect}" unless perms == { "contents" => "read" }
oidc = []
wf.fetch("jobs").each do |name, job|
  next unless (job["permissions"] || {})["id-token"] == "write"
  cond = job["if"].to_s
  unless cond == "github.ref == 'refs/heads/main' && github.event_name == 'push'"
    abort "job #{name} grants id-token: write without a main-push gate"
  end
  oidc << name
end
abort "no job grants id-token: write, so the ECR push job is missing" if oidc.empty?
puts "id-token only in: #{oidc.join(", ")}"
RUBY

# 1. Token permissions and OIDC gating.
out="$(ruby "$WORK/gates.rb" "$WF" 2>&1)"; rc=$?
if [ "$rc" = 0 ]; then
  ok "gates: read-only top-level token; OIDC only in main-push jobs ($out)"
else
  bad "gates: $out"
fi

# 2. Extract the real step texts. Syntax-check them before running anything.
ruby "$WORK/extract.rb" "$WF" deploy "SSH deploy" script >"$WORK/deploy.raw" 2>"$WORK/err" \
  || bad "extract: deploy / SSH deploy script ($(cat "$WORK/err"))"
if bash -n "$WORK/deploy.raw"; then
  ok "syntax: extracted SSH deploy script parses (bash -n)"
else
  bad "syntax: an extracted script does not parse"
fi

# --- 3. Production SSH deploy script: public gate and rollback. -----------------
# Stubs for sudo, docker, aws, curl and sleep. They record to $STUB_LOG and decide
# the outcome from the digest the env file points at ("aaaa" = new, "bbbb" = prev).
mkdir -p "$WORK/stubs"
cat >"$WORK/stubs/sudo" <<'STUB'
#!/usr/bin/env bash
# Stub for sudo: run as this user. `sed -i` goes through a temp file so the same
# call works with GNU sed (CI) and BSD sed (macOS).
if [ "$1" = "sed" ] && [ "$2" = "-i" ]; then
  sed "$3" "$4" >"$4.stub" && mv "$4.stub" "$4"
  exit $?
fi
exec "$@"
STUB
cat >"$WORK/stubs/docker" <<'STUB'
#!/usr/bin/env bash
# Stub for docker. `compose ... up` logs "up <first 4 chars of the digest>" for the
# image named in its --env-file, and fails if that digest is in $STUB_BROKEN_APPLY.
case "$1" in
  login) cat >/dev/null; exit 0 ;;   # drain the password pipe
  pull) exit 0 ;;
  run)
    if grep -q 'f2634.jpg' /dev/stdin; then
      echo "previous image alex probe" >>"$STUB_LOG"
      [ "${STUB_PREV_HAS_ALEX:-0}" = 1 ]; exit $?;
    fi
    echo "previous image poster probe" >>"$STUB_LOG"
    [ "${STUB_PREV_HAS_POSTERS:-1}" = 1 ]; exit $? ;;
  compose)
    for a in "$@"; do
      if [ "$a" = "ps" ]; then
        img="$(grep -E '^DISCAMMER_IMAGE=' "$STUB_ENV_FILE" | cut -d= -f2-)"
        dig="${img#*@sha256:}"
        if [ -z "${STUB_EMPTY_CID:-}" ] && { [ -z "${STUB_EMPTY_NEW_CID:-}" ] || [ "$dig" != "$STUB_NEW_DIG" ]; }; then
          printf 'test-container-id\n'
        fi
        exit 0
      fi
    done
    envf=""; prev=""
    for a in "$@"; do
      if [ "$prev" = "--env-file" ]; then envf="$a"; fi
      prev="$a"
    done
    img="$(grep -E '^DISCAMMER_IMAGE=' "$envf" | cut -d= -f2-)"
    dig="${img#*@sha256:}"
    echo "up ${dig:0:4}" >>"$STUB_LOG"
    for b in ${STUB_BROKEN_APPLY:-}; do
      if [ "$dig" = "$b" ]; then exit 1; fi
    done
    exit 0 ;;
  exec)
    if [[ " $* " == *"editorial_course_sync.py"* ]] && [[ " $* " != *" -u 10001 "* ]]; then
      echo 'course command used wrong UID' >>"$STUB_LOG"
      exit 1
    fi
    case " $* " in
      *"python -c "*)
        echo "seed check" >>"$STUB_LOG"
        [ -z "${STUB_SEED_CHECK_FAIL:-}" ]; exit $? ;;
      *"editorial_course_sync.py --dry-run"*)
        echo "course preflight" >>"$STUB_LOG"
        [ -z "${STUB_COURSE_PREFLIGHT_FAIL:-}" ] || exit 1
        if [ -n "${STUB_COURSE_NO_CHANGE:-}" ]; then
          printf '{"localized_lessons": 110, "changed": 0, "applied": false}\n'
        else
          printf '{"localized_lessons": 110, "changed": 110, "applied": false}\n'
        fi
        exit 0 ;;
      *"alex_poster_migration.py status"*)
        echo "alex status" >>"$STUB_LOG"
        [ -z "${STUB_ALEX_STATUS_FAIL:-}" ] || exit 1
        cat "$STUB_STATE_DIR/alex-state"; exit 0 ;;
      *"alex_poster_migration.py apply"*)
        echo "alex apply" >>"$STUB_LOG"
        [ -z "${STUB_ALEX_APPLY_FAIL:-}" ] || exit 1
        if [ "$(cat "$STUB_STATE_DIR/alex-state")" = old ]; then
          printf 'new\n' >"$STUB_STATE_DIR/alex-state"
          [ -z "${STUB_ALEX_COMMITTED_ERROR:-}" ] || exit 1
          printf 'applied: 2 post rows\n'
        else
          printf 'already applied: 2 post rows\n'
        fi
        exit 0 ;;
      *"alex_poster_migration.py restore"*)
        echo "alex restore" >>"$STUB_LOG"
        [ -z "${STUB_ALEX_RESTORE_FAIL:-}" ] || exit 1
        printf 'old\n' >"$STUB_STATE_DIR/alex-state"
        exit 0 ;;
      *"poster_migration.py status"*)
        echo "poster status" >>"$STUB_LOG"
        [ -z "${STUB_STATUS_FAIL:-}" ] || exit 1
        cat "$STUB_ROW_FILE"; exit 0 ;;
      *"poster_migration.py apply"*)
        echo "poster apply" >>"$STUB_LOG"
        [ -z "${STUB_MIGRATE_FAIL:-}" ] || exit 1
        if [ "$(cat "$STUB_ROW_FILE")" = old ]; then
          printf 'new\n' >"$STUB_ROW_FILE"
          [ -z "${STUB_POSTER_COMMITTED_ERROR:-}" ] || exit 1
          printf 'applied: 14 post rows; backup /app/data/poster-backup.json\n'
        else
          printf 'already applied: 14 post rows\n'
        fi
        exit 0 ;;
      *"poster_migration.py restore"*)
        echo "poster restore" >>"$STUB_LOG"
        [ -z "${STUB_RESTORE_FAIL:-}" ] || exit 1
        printf 'old\n' >"$STUB_ROW_FILE"
        exit 0 ;;
      *"editorial_course_sync.py --apply"*)
        echo "course apply" >>"$STUB_LOG"
        [ -z "${STUB_COURSE_APPLY_FAIL:-}" ] || exit 1
        if [ -n "${STUB_COURSE_APPLY_COMMITTED_ERROR:-}" ]; then
          printf 'applied\n' >"$STUB_STATE_DIR/course-state"
          echo "course committed before command error" >>"$STUB_LOG"
          exit 1
        fi
        if [ -n "${STUB_COURSE_NO_CHANGE:-}" ]; then
          printf '{"changed": 0, "snapshot": null}\n'
        else
          printf 'applied\n' >"$STUB_STATE_DIR/course-state"
          printf '{"changed": 110, "snapshot": "/app/data/course-editorial-before.json"}\n'
        fi
        exit 0 ;;
      *"editorial_course_sync.py --status"*)
        echo "course status" >>"$STUB_LOG"
        [ -z "${STUB_COURSE_STATUS_FAIL:-}" ] || exit 1
        if [ -f "$STUB_STATE_DIR/course-state" ]; then cat "$STUB_STATE_DIR/course-state"; else printf 'absent\n'; fi
        exit 0 ;;
      *"editorial_course_sync.py --restore"*)
        echo "course restore" >>"$STUB_LOG"
        [ -z "${STUB_COURSE_RESTORE_FAIL:-}" ] || exit 1
        printf 'original\n' >"$STUB_STATE_DIR/course-state"
        [ -z "${STUB_COURSE_RESTORE_COMMITTED_ERROR:-}" ]; exit $? ;;
    esac
    exit 1 ;;
esac
exit 0
STUB
cat >"$WORK/stubs/curl" <<'STUB'
#!/usr/bin/env bash
# Stub local and public probes, including a foreign public SHA after migration.
url=""
status=0
for a in "$@"; do
  case "$a" in https://discammer.com*) url="$a" ;; -w) status=1 ;; esac
done
if [ -n "$url" ]; then
  case "$url" in
    *'/api/course/phishing/lookalike-domains?lang='*)
      echo 'public course' >>"$STUB_LOG"
      lang="${url##*=}"
      if [ -n "${STUB_PUBLIC_COURSE_STALE:-}" ]; then
        printf '{"locale":"%s","widget_type":"quiz","body_md":"old"}' "$lang"
      else
        body="$(printf '%0501d' 0)"
        printf '{"locale":"%s","widget_type":"course_v2","body_md":"%s","widget_config":{"revision":"2026-10-20","blocks":[{"type":"practice","steps":[{},{},{}]}]}}' "$lang" "$body"
      fi
      exit 0 ;;
    *'/api/posts?lang='*)
      echo 'public alex card' >>"$STUB_LOG"
      printf '[{"slug":"the-story-of-alex-chen","cover_image":"/static/images/video-posters/the-story-of-alex-chen-20261020-f2634.jpg"}]'
      exit 0 ;;
    *'/journal/the-story-of-alex-chen'*)
      echo 'public alex page' >>"$STUB_LOG"
      printf '<img src="/static/images/video-posters/the-story-of-alex-chen-20261020-f2634.jpg">'
      exit 0 ;;
    *'/static/images/video-posters/the-story-of-alex-chen-20261020-f2634.jpg'*)
      echo 'public alex asset' >>"$STUB_LOG"
      cat "$STUB_POSTER_ASSET"
      exit 0 ;;
  esac
  if [ "$status" = 1 ]; then
    if [ -n "${STUB_PUBLIC_BAD_PATH:-}" ] && [ "$url" = "https://discammer.com${STUB_PUBLIC_BAD_PATH}" ]; then
      echo 'public 503' >>"$STUB_LOG"; printf 503
    else
      echo 'public 200' >>"$STUB_LOG"; printf 200
    fi
  else
    echo 'public version' >>"$STUB_LOG"
    printf '{"status":"ok","version":"%s"}' "${STUB_PUBLIC_VERSION-$STUB_GIT_SHORT}"
  fi
  exit 0
fi
img="$(grep -E '^DISCAMMER_IMAGE=' "$STUB_ENV_FILE" | cut -d= -f2-)"
dig="${img#*@sha256:}"
if [ "$dig" = "$STUB_NEW_DIG" ]; then
  ver="${STUB_NEW_VERSION:-$STUB_GIT_SHORT}"; down="${STUB_NEW_DOWN:-}"
else
  ver="bbbbbbb"; down="${STUB_PREV_DOWN:-}"
fi
if [ -n "$down" ]; then echo "health ${dig:0:4} down" >>"$STUB_LOG"; exit 22; fi
echo "health ${dig:0:4} ok" >>"$STUB_LOG"
printf '{"status":"ok","version":"%s"}' "$ver"
STUB
cat >"$WORK/stubs/aws" <<'STUB'
#!/usr/bin/env bash
echo "test-token"
STUB
cat >"$WORK/stubs/sleep" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$WORK/stubs/"*

REG="123456789012.dkr.ecr.eu-central-1.amazonaws.com"
NEW_DIG="$(printf 'a%.0s' $(seq 1 64))"
PREV_DIG="$(printf 'b%.0s' $(seq 1 64))"
GIT_SHORT="0123456"
PREV_IMG="$REG/discammer-web@sha256:$PREV_DIG"

# run_deploy NAME [VAR=VALUE ...]: run the production SSH script in a sandbox at
# $WORK/NAME with /etc/discammer redirected there. Sets DEPLOY_RC.
run_deploy() {
  local name="$1" d row_initial=new alex_initial=old setting
  shift
  for setting in "$@"; do
    case "$setting" in
      STUB_POSTER_INITIAL=*) row_initial="${setting#*=}" ;;
      STUB_ALEX_INITIAL=*) alex_initial="${setting#*=}" ;;
    esac
  done
  d="$WORK/$name"
  mkdir -p "$d/etc" "$d/bin"
  mkdir -p "$d/state"
  cp "$WORK/stubs/"* "$d/bin/"
  sed "s|/etc/discammer|$d/etc|g" "$WORK/deploy.raw" >"$d/deploy.sh"
  printf 'DISCAMMER_IMAGE=%s\nKEEP_ME=1\n' "$PREV_IMG" >"$d/etc/deployment.env"
  : >"$d/etc/compose.yaml"
  : >"$d/log"
  printf '%s\n' "$row_initial" >"$d/row-state"
  printf '%s\n' "$alex_initial" >"$d/state/alex-state"
  env -i PATH="$d/bin:/usr/bin:/bin" HOME="$d" \
    IMAGE_REGISTRY="$REG" IMAGE_DIGEST="sha256:$NEW_DIG" GIT_SHORT="$GIT_SHORT" DEPLOY_RUN="12345-1" \
    CF_API_TOKEN="" CF_ZONE_ID="" \
    STUB_LOG="$d/log" STUB_ENV_FILE="$d/etc/deployment.env" STUB_STATE_DIR="$d/state" STUB_ROW_FILE="$d/row-state" \
    STUB_POSTER_ASSET="$ROOT/backend/static/images/video-posters/the-story-of-alex-chen-20261020-f2634.jpg" \
    STUB_NEW_DIG="$NEW_DIG" STUB_GIT_SHORT="$GIT_SHORT" "$@" \
    bash "$d/deploy.sh" >"$d/out" 2>&1
  DEPLOY_RC=$?
}

show() {  # $1 sandbox name: the last lines of output and of the stub log
  tail -n 4 "$WORK/$1/out" | sed 's/^/      out: /'
  tail -n 4 "$WORK/$1/log" | sed 's/^/      log: /'
}

check_rollback() {  # $1 sandbox name, $2 label, $3 expected poster state (default new)
  local d="$WORK/$1" last expected="${3:-new}"
  last="$(tail -n 1 "$d/log")"
  if [ "$DEPLOY_RC" = 1 ] && [ "$last" = "health bbbb ok" ] \
     && [ "$(cat "$d/row-state")" = "$expected" ] \
     && [ "$(cat "$d/state/alex-state")" = old ] \
     && grep -q "@sha256:$PREV_DIG\$" "$d/etc/deployment.env" \
     && grep -qx 'KEEP_ME=1' "$d/etc/deployment.env" \
     && ! grep -q 'ROLLBACK FAILED' "$d/out"; then
    ok "$2"
  else
    bad "$2 (rc=$DEPLOY_RC, last log line: '$last')"
    show "$1"
  fi
}

check_rollback_failed() {  # $1 sandbox name, $2 label
  local d="$WORK/$1"
  if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED' "$d/out" \
     && grep -q "@sha256:$PREV_DIG\$" "$d/etc/deployment.env"; then
    ok "$2"
  else
    bad "$2 (rc=$DEPLOY_RC)"
    show "$1"
  fi
}

# a. Healthy new image: deploys, no rollback.
run_deploy happy
if [ "$DEPLOY_RC" = 0 ] && grep -qx 'up aaaa' "$WORK/happy/log" \
   && grep -qx 'seed check' "$WORK/happy/log" \
   && grep -qx 'course preflight' "$WORK/happy/log" \
   && grep -qx 'poster apply' "$WORK/happy/log" \
   && grep -qx 'alex apply' "$WORK/happy/log" \
   && grep -qx 'course apply' "$WORK/happy/log" \
   && grep -qx 'public version' "$WORK/happy/log" \
   && grep -qx 'public alex asset' "$WORK/happy/log" \
   && [ "$(cat "$WORK/happy/state/alex-state")" = new ] \
   && ! grep -qx 'up bbbb' "$WORK/happy/log" \
   && grep -q "@sha256:$NEW_DIG\$" "$WORK/happy/etc/deployment.env"; then
  ok "deploy: healthy new image deploys with no rollback (exit 0)"
else
  bad "deploy: healthy new image (rc=$DEPLOY_RC)"
  show happy
fi

# Effective seeding is checked before the image reference changes.
run_deploy seed-check-fail STUB_SEED_CHECK_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && ! grep -q '^up ' "$WORK/seed-check-fail/log" \
   && grep -q "@sha256:$PREV_DIG\$" "$WORK/seed-check-fail/etc/deployment.env"; then
  ok "deploy: enabled startup seed stops before image change"
else
  bad "deploy: enabled startup seed did not stop before image change"
  show seed-check-fail
fi

# New-image lesson preflight must precede both editorial updates.
run_deploy course-preflight-fail STUB_COURSE_PREFLIGHT_FAIL=1
check_rollback course-preflight-fail "deploy: failed course preflight rolls back image"
if ! grep -q 'poster apply\|course apply' "$WORK/course-preflight-fail/log"; then
  ok "deploy: failed course preflight skips editorial updates"
else
  bad "deploy: failed course preflight ran an editorial update"
fi

# A failed transactional editorial update rolls the image back.
run_deploy migration-fail STUB_MIGRATE_FAIL=1
check_rollback migration-fail "deploy: failed editorial update rolls back the image"
run_deploy course-apply-fail STUB_COURSE_APPLY_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: course state could not be proved restored' "$WORK/course-apply-fail/out" \
   && grep -q "@sha256:$NEW_DIG\$" "$WORK/course-apply-fail/etc/deployment.env" \
   && ! grep -qx 'up bbbb' "$WORK/course-apply-fail/log"; then
  ok "deploy: missing snapshot after failed change retains compatible new image"
else
  bad "deploy: ambiguous missing snapshot selected old image"
fi
run_deploy course-no-change-apply-fail STUB_COURSE_NO_CHANGE=1 STUB_COURSE_APPLY_FAIL=1
check_rollback course-no-change-apply-fail "deploy: failed no-op course update rolls back after count preflight"
run_deploy course-commit-then-error STUB_COURSE_APPLY_COMMITTED_ERROR=1
if [ "$(grep -E 'course restore|up bbbb' "$WORK/course-commit-then-error/log" | paste -sd, -)" = 'course restore,up bbbb' ]; then
  check_rollback course-commit-then-error "deploy: course command error after commit restores rows before old image"
else
  bad "deploy: course commit-then-error did not restore rows before image rollback"
fi
run_deploy course-commit-restore-fails STUB_COURSE_APPLY_COMMITTED_ERROR=1 STUB_COURSE_RESTORE_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: course state' "$WORK/course-commit-restore-fails/out" \
   && grep -q "@sha256:$NEW_DIG\$" "$WORK/course-commit-restore-fails/etc/deployment.env" \
   && ! grep -qx 'up bbbb' "$WORK/course-commit-restore-fails/log"; then
  ok "deploy: ambiguous course commit with rejected restore retains new image"
else
  bad "deploy: ambiguous course commit selected old image despite failed restore"
fi
run_deploy container-missing STUB_EMPTY_NEW_CID=1
check_rollback container-missing "deploy: missing web container rolls back the image"
run_deploy status-unknown STUB_STATUS_FAIL=1 STUB_POSTER_INITIAL=old
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: editorial preflight state unknown' "$WORK/status-unknown/out" \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/status-unknown/etc/deployment.env" \
  && [ "$(cat "$WORK/status-unknown/row-state")" = old ] \
  && ! grep -qx 'up bbbb' "$WORK/status-unknown/log"; then
  ok 'deploy: unknown editorial preflight retains new image rather than asserting old compatibility'
else
  bad 'deploy: unknown editorial preflight must fail without selecting the old image'
fi
run_deploy already-new-old-image STUB_PUBLIC_VERSION=fffffff STUB_PREV_HAS_POSTERS=0
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: editorial state' "$WORK/already-new-old-image/out" \
  && grep -qx 'previous image poster probe' "$WORK/already-new-old-image/log" \
  && [ "$(cat "$WORK/already-new-old-image/row-state")" = new ] \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/already-new-old-image/etc/deployment.env" \
  && ! grep -qx 'up bbbb' "$WORK/already-new-old-image/log"; then
  ok 'deploy: already-new rows never select an assetless previous image'
else
  bad 'deploy: already-new rows require previous-image asset proof before rollback'
fi
run_deploy already-new-compatible-image STUB_PUBLIC_VERSION=fffffff STUB_PREV_HAS_POSTERS=1
if [ "$DEPLOY_RC" = 1 ] && grep -qx 'previous image poster probe' "$WORK/already-new-compatible-image/log" \
  && grep -qx 'up bbbb' "$WORK/already-new-compatible-image/log" \
  && [ "$(cat "$WORK/already-new-compatible-image/row-state")" = new ] \
  && grep -q "@sha256:$PREV_DIG\$" "$WORK/already-new-compatible-image/etc/deployment.env"; then
  ok 'deploy: already-new rows roll back only to a poster-compatible image'
else
  bad 'deploy: verified previous image should remain a valid rollback target'
fi

# The correction uses a separate two-row snapshot. A committed apply failure
# must restore it before selecting the old image. An already-corrected DB can
# pair with the previous image only if that image contains the exact new asset.
run_deploy alex-commit-then-error STUB_ALEX_COMMITTED_ERROR=1
if [ "$(grep -E 'alex restore|up bbbb' "$WORK/alex-commit-then-error/log" | paste -sd, -)" = 'alex restore,up bbbb' ]; then
  check_rollback alex-commit-then-error "deploy: committed Alex correction restores two rows before old image"
else
  bad "deploy: committed Alex correction was not restored before image rollback"
fi
run_deploy corrected-prev-missing STUB_ALEX_INITIAL=new STUB_PUBLIC_VERSION=fffffff STUB_PREV_HAS_ALEX=0
if [ "$DEPLOY_RC" = 1 ] && grep -qx 'previous image alex probe' "$WORK/corrected-prev-missing/log" \
  && grep -q 'ROLLBACK FAILED: Alex poster rows' "$WORK/corrected-prev-missing/out" \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/corrected-prev-missing/etc/deployment.env" \
  && ! grep -qx 'up bbbb' "$WORK/corrected-prev-missing/log"; then
  ok 'deploy: already-corrected DB rejects previous image without exact new asset'
else
  bad 'deploy: corrected DB paired with assetless previous image'
fi
run_deploy corrected-prev-supported STUB_ALEX_INITIAL=new STUB_PUBLIC_VERSION=fffffff STUB_PREV_HAS_ALEX=1
if [ "$DEPLOY_RC" = 1 ] && grep -qx 'previous image alex probe' "$WORK/corrected-prev-supported/log" \
  && [ "$(cat "$WORK/corrected-prev-supported/state/alex-state")" = new ] \
  && grep -qx 'up bbbb' "$WORK/corrected-prev-supported/log" \
  && grep -q "@sha256:$PREV_DIG\$" "$WORK/corrected-prev-supported/etc/deployment.env"; then
  ok 'deploy: already-corrected DB rolls back only to image with exact asset'
else
  bad 'deploy: compatible corrected rollback target was rejected'
fi

# B may only publish after A's posters are already applied. A changed poster
# row in this attempt is restored before the A image is reselected.
run_deploy posters-not-live STUB_POSTER_INITIAL=old
if grep -qx 'poster restore' "$WORK/posters-not-live/log"; then
  check_rollback posters-not-live "deploy: out-of-order poster update is restored before image rollback" old
else
  bad "deploy: out-of-order poster update was not restored"
fi
run_deploy poster-commit-then-error STUB_POSTER_INITIAL=old STUB_POSTER_COMMITTED_ERROR=1
if [ "$(grep -E 'poster restore|up bbbb' "$WORK/poster-commit-then-error/log" | paste -sd, -)" = 'poster restore,up bbbb' ]; then
  check_rollback poster-commit-then-error "deploy: ambiguous committed poster update restores rows before old image" old
else
  bad "deploy: ambiguous committed poster update did not restore rows before image"
fi

# b. The new image fails to start: roll back, then probe the restored image.
run_deploy apply-fail STUB_BROKEN_APPLY="$NEW_DIG"
check_rollback apply-fail "deploy: failed apply rolls back and the restored image is probed"

# c. The new image starts but reports a foreign version: same rollback.
run_deploy version-mismatch STUB_NEW_VERSION=fffffff
check_rollback version-mismatch "deploy: version mismatch rolls back and the restored image is probed"

# d. The new image starts but its probe is down: same rollback.
run_deploy crash-loop STUB_NEW_DOWN=1
check_rollback crash-loop "deploy: crash-loop rolls back and the restored image is probed"

# e. The rollback target does not come up: must be reported as ROLLBACK FAILED.
run_deploy rollback-unhealthy STUB_NEW_VERSION=fffffff STUB_PREV_DOWN=1
check_rollback_failed rollback-unhealthy "deploy: unhealthy rollback target is reported as ROLLBACK FAILED"

# f. The rollback apply itself fails: must be reported as ROLLBACK FAILED.
run_deploy rollback-apply-fails STUB_BROKEN_APPLY="$NEW_DIG $PREV_DIG"
check_rollback_failed rollback-apply-fails "deploy: failed rollback apply is reported as ROLLBACK FAILED"

# g. Public failure comes after course publication. Restore THIS attempt's
# course rows before selecting the prior A image, then probe it.
run_deploy public-version-mismatch STUB_PUBLIC_VERSION=fffffff
if grep -qx 'course restore' "$WORK/public-version-mismatch/log" \
   && [ "$(grep -nE 'course restore|up bbbb' "$WORK/public-version-mismatch/log" | cut -d: -f2- | paste -sd, -)" = 'course restore,up bbbb' ]; then
  check_rollback public-version-mismatch "deploy: foreign public SHA restores course rows, image and health"
else
  bad 'deploy: public rollback must restore the course rows before the old image'
fi
run_deploy public-route-fail STUB_PUBLIC_BAD_PATH=/en/course
check_rollback public-route-fail "deploy: failed public route restores previous image"
run_deploy public-course-stale STUB_PUBLIC_COURSE_STALE=1
if grep -qx 'course restore' "$WORK/public-course-stale/log"; then
  check_rollback public-course-stale "deploy: stale public course exercise restores rows and previous image"
else
  bad "deploy: stale public course exercise did not restore editorial rows"
fi
run_deploy public-empty-version STUB_PUBLIC_VERSION=
check_rollback public-empty-version "deploy: empty public SHA fails closed and rolls back"
run_deploy public-restore-fails STUB_PUBLIC_VERSION=fffffff STUB_COURSE_RESTORE_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: course rows could not be proved restored' "$WORK/public-restore-fails/out" \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/public-restore-fails/etc/deployment.env" \
  && ! grep -qx 'up bbbb' "$WORK/public-restore-fails/log"; then
  ok 'deploy: rejected course restore retains compatible new image and reports failure'
else
  bad 'deploy: rejected course restore must not select old image with new lesson rows'
fi
run_deploy public-restore-committed-error STUB_PUBLIC_VERSION=fffffff STUB_COURSE_RESTORE_COMMITTED_ERROR=1
check_rollback public-restore-committed-error 'deploy: restore that committed before command error is verified by row state'
run_deploy course-status-fails STUB_COURSE_STATUS_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: course update state cannot be verified' "$WORK/course-status-fails/out" \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/course-status-fails/etc/deployment.env" \
  && ! grep -qx 'up bbbb' "$WORK/course-status-fails/log"; then
  ok 'deploy: unavailable course state check retains compatible new image'
else
  bad 'deploy: unavailable course state check selected old image without proof'
fi

run_deploy public-no-course-change STUB_PUBLIC_VERSION=fffffff STUB_COURSE_NO_CHANGE=1
if ! grep -qx 'course restore' "$WORK/public-no-course-change/log"; then
  check_rollback public-no-course-change "deploy: no-op course update needs no snapshot restore"
else
  bad 'deploy: no-op course update attempted snapshot restore'
fi

echo "----"
echo "$pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then exit 1; fi
exit 0
