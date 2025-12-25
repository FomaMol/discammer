#!/usr/bin/env bash
# CI/CD guard tests. They run the REAL text of .github/workflows/ci-cd.yml, not a
# copy, so a regression in the workflow fails here:
#   1. the top-level token is read-only, and id-token: write (OIDC for the ECR
#      push) appears only in jobs gated to a main push;
#   2. the "Health check" step fails closed on an empty, short or foreign version;
#   3. the production SSH deploy script rolls back after a failed apply or health
#      probe, re-probes the restored image, and reports a failed rollback loudly.
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
ruby "$WORK/extract.rb" "$WF" deploy "Health check" run >"$WORK/health.sh" 2>"$WORK/err" \
  || bad "extract: deploy / Health check run ($(cat "$WORK/err"))"
ruby "$WORK/extract.rb" "$WF" deploy "SSH deploy" script >"$WORK/deploy.raw" 2>"$WORK/err" \
  || bad "extract: deploy / SSH deploy script ($(cat "$WORK/err"))"
if bash -n "$WORK/health.sh" && bash -n "$WORK/deploy.raw"; then
  ok "syntax: extracted health-check and SSH deploy scripts parse (bash -n)"
else
  bad "syntax: an extracted script does not parse"
fi

# --- 3. Health check: the domain must report the shipped SHA, or the step fails.
mkdir -p "$WORK/hbin"
cat >"$WORK/hbin/curl" <<'STUB'
#!/usr/bin/env bash
# Stub for the Health check step. Status probes (-w) answer 200; the version
# probe (no -w) answers $STUB_BODY.
for a in "$@"; do
  if [ "$a" = "-w" ]; then printf '200'; exit 0; fi
done
printf '%s' "${STUB_BODY:-}"
STUB
chmod +x "$WORK/hbin/curl"

HEALTH_SHA="0123456789abcdef0123456789abcdef01234567"
run_health() {  # $1 label, $2 body the domain returns, $3 expected exit code
  local rc
  STUB_BODY="$2" GITHUB_SHA="$HEALTH_SHA" PATH="$WORK/hbin:$PATH" \
    bash -e "$WORK/health.sh" >"$WORK/health.out" 2>&1
  rc=$?
  if [ "$rc" = "$3" ]; then
    ok "$1 (exit $rc)"
  else
    bad "$1 (exit $rc, want $3)"
    tail -n 3 "$WORK/health.out" | sed 's/^/      /'
  fi
}
run_health "health: matching version passes" \
  '{"status":"ok","version":"0123456"}' 0
run_health "health: HTML 200 without a version field fails" \
  '<!doctype html><html><body>ok</body></html>' 1
run_health "health: empty version fails" \
  '{"status":"ok","version":""}' 1
run_health "health: foreign version fails" \
  '{"status":"ok","version":"fffffff"}' 1
run_health "health: 1-char prefix fails" \
  '{"status":"ok","version":"0"}' 1

# --- 4. Production SSH deploy script: rollback and its reporting. ---------------
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
esac
exit 0
STUB
cat >"$WORK/stubs/curl" <<'STUB'
#!/usr/bin/env bash
# Stub for the app probe on 127.0.0.1:8000. It answers for the image the env file
# points at: the digest under test ("new") or any other digest ("prev").
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
  : >"$d/etc/compose.yaml"
  : >"$d/log"
  env -i PATH="$d/bin:/usr/bin:/bin" HOME="$d" \
    IMAGE_REGISTRY="$REG" IMAGE_DIGEST="sha256:$NEW_DIG" GIT_SHORT="$GIT_SHORT" \
    CF_API_TOKEN="" CF_ZONE_ID="" \
    STUB_LOG="$d/log" STUB_ENV_FILE="$d/etc/deployment.env" \
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
   && ! grep -qx 'up bbbb' "$WORK/happy/log" \
   && grep -q "@sha256:$NEW_DIG\$" "$WORK/happy/etc/deployment.env"; then
  ok "deploy: healthy new image deploys with no rollback (exit 0)"
else
  bad "deploy: healthy new image (rc=$DEPLOY_RC)"
  show happy
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

echo "----"
echo "$pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then exit 1; fi
exit 0
