#!/usr/bin/env bash
# CI/CD guard tests. They run the REAL text of .github/workflows/ci-cd.yml, not a
# copy, so a regression in the workflow fails here:
#   1. the top-level token is read-only, and id-token: write (OIDC for the ECR
#      push) appears only in jobs gated to a main push;
#   2. the production SSH deploy script checks the public domain in the same
#      transaction as the editorial update, then restores the exact changed rows
#      and previous image if public verification fails;
#   3. a command error after the editorial transaction commits cannot select
#      the previous image until those exact rows are restored and verified.
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
  compose)
    for a in "$@"; do
      if [ "$a" = "ps" ]; then
        [ -z "${STUB_EMPTY_CID:-}" ] && printf 'test-container-id\n'
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
    mode=""
    for a in "$@"; do
      case "$a" in apply|restore|status) mode="$a" ;; esac
    done
    echo "migration $mode" >>"$STUB_LOG"
    if [ "$mode" = status ]; then
      [ -z "${STUB_STATUS_FAIL:-}" ] || exit 1
      cat "$STUB_ROW_FILE"
      exit 0
    fi
    if [ "$mode" = apply ]; then
      [ -z "${STUB_MIGRATE_FAIL:-}" ] || exit 1
      printf 'new\n' >"$STUB_ROW_FILE"
      [ -z "${STUB_COMMIT_THEN_ERROR:-}" ] || exit 1
      printf 'applied: 14 post rows; backup /app/data/poster-backup.json\n'
      exit 0
    fi
    [ -z "${STUB_RESTORE_FAIL:-}" ] || exit 1
    printf 'old\n' >"$STUB_ROW_FILE"
    exit 0 ;;
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
  local name="$1" d
  shift
  d="$WORK/$name"
  mkdir -p "$d/etc" "$d/bin"
  cp "$WORK/stubs/"* "$d/bin/"
  sed "s|/etc/discammer|$d/etc|g" "$WORK/deploy.raw" >"$d/deploy.sh"
  printf 'DISCAMMER_IMAGE=%s\nKEEP_ME=1\n' "$PREV_IMG" >"$d/etc/deployment.env"
  printf 'old\n' >"$d/row-state"
  : >"$d/etc/compose.yaml"
  : >"$d/log"
  env -i PATH="$d/bin:/usr/bin:/bin" HOME="$d" \
    IMAGE_REGISTRY="$REG" IMAGE_DIGEST="sha256:$NEW_DIG" GIT_SHORT="$GIT_SHORT" \
    CF_API_TOKEN="" CF_ZONE_ID="" \
    STUB_LOG="$d/log" STUB_ENV_FILE="$d/etc/deployment.env" STUB_ROW_FILE="$d/row-state" \
    STUB_NEW_DIG="$NEW_DIG" STUB_GIT_SHORT="$GIT_SHORT" "$@" \
    bash "$d/deploy.sh" >"$d/out" 2>&1
  DEPLOY_RC=$?
}

show() {  # $1 sandbox name: the last lines of output and of the stub log
  tail -n 4 "$WORK/$1/out" | sed 's/^/      out: /'
  tail -n 4 "$WORK/$1/log" | sed 's/^/      log: /'
}

check_rollback() {  # $1 sandbox name, $2 label
  local d="$WORK/$1" last
  last="$(tail -n 1 "$d/log")"
  if [ "$DEPLOY_RC" = 1 ] && [ "$last" = "health bbbb ok" ] \
     && [ "$(cat "$d/row-state")" = old ] \
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
   && grep -qx 'migration apply' "$WORK/happy/log" \
   && [ "$(cat "$WORK/happy/row-state")" = new ] \
   && grep -qx 'public version' "$WORK/happy/log" \
   && ! grep -qx 'up bbbb' "$WORK/happy/log" \
   && grep -q "@sha256:$NEW_DIG\$" "$WORK/happy/etc/deployment.env"; then
  ok "deploy: healthy new image deploys with no rollback (exit 0)"
else
  bad "deploy: healthy new image (rc=$DEPLOY_RC)"
  show happy
fi

# A failed transactional editorial update rolls the image back. An older
# snapshot must not be restored, because it may predate an earlier release.
run_deploy migration-fail STUB_MIGRATE_FAIL=1
check_rollback migration-fail "deploy: failed editorial update rolls back the image"
run_deploy commit-then-error STUB_COMMIT_THEN_ERROR=1
if [ "$(cat "$WORK/commit-then-error/row-state")" = old ] \
   && [ "$(grep -E 'migration restore|up bbbb' "$WORK/commit-then-error/log" | paste -sd, -)" = 'migration restore,up bbbb' ]; then
  check_rollback commit-then-error "deploy: post-commit command error restores rows before old image"
else
  bad 'deploy: post-commit command error must restore rows before old image'
fi
run_deploy container-missing STUB_EMPTY_CID=1
check_rollback container-missing "deploy: missing web container rolls back the image"
run_deploy status-unknown STUB_STATUS_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: editorial preflight state unknown' "$WORK/status-unknown/out" \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/status-unknown/etc/deployment.env" \
  && [ "$(cat "$WORK/status-unknown/row-state")" = old ] \
  && ! grep -qx 'up bbbb' "$WORK/status-unknown/log"; then
  ok 'deploy: unknown editorial preflight retains new image rather than asserting old compatibility'
else
  bad 'deploy: unknown editorial preflight must fail without selecting the old image'
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

# g. Public failure comes after migration. Restore THIS attempt's rows before
# selecting the previous image, and probe that previous image in the same step.
run_deploy public-version-mismatch STUB_PUBLIC_VERSION=fffffff
if grep -qx 'migration restore' "$WORK/public-version-mismatch/log" \
   && [ "$(grep -nE 'migration restore|up bbbb' "$WORK/public-version-mismatch/log" | cut -d: -f2- | paste -sd, -)" = 'migration restore,up bbbb' ]; then
  check_rollback public-version-mismatch "deploy: foreign public SHA restores rows, image and health"
else
  bad 'deploy: public rollback must restore the changed rows before the old image'
fi
run_deploy public-route-fail STUB_PUBLIC_BAD_PATH=/en/course
check_rollback public-route-fail "deploy: failed public route restores previous image"
run_deploy public-empty-version STUB_PUBLIC_VERSION=
check_rollback public-empty-version "deploy: empty public SHA fails closed and rolls back"
run_deploy public-restore-fails STUB_PUBLIC_VERSION=fffffff STUB_RESTORE_FAIL=1
if [ "$DEPLOY_RC" = 1 ] && grep -q 'ROLLBACK FAILED: editorial state' "$WORK/public-restore-fails/out" \
  && [ "$(cat "$WORK/public-restore-fails/row-state")" = new ] \
  && grep -q "@sha256:$NEW_DIG\$" "$WORK/public-restore-fails/etc/deployment.env" \
  && ! grep -qx 'up bbbb' "$WORK/public-restore-fails/log"; then
  ok 'deploy: rejected editorial restore retains compatible new image and reports failure'
else
  bad 'deploy: rejected editorial restore must not select old image with new poster URLs'
fi

echo "----"
echo "$pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then exit 1; fi
exit 0
