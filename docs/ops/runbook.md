# Incident Runbook (REL-2)

Operational playbook for DiScammer production. Read top-to-bottom only during your
first incident; after that jump straight to the matching incident section.

> **Scope.** This covers the live site only. Backups/restore live in
> [`docs/ops/backups.md`](./backups.md) (REL-1); secrets live in
> [`docs/ops/secrets.md`](./secrets.md) (SEC-3); load-test baselines live in
> [`docs/deploy/capacity.md`](../deploy/capacity.md) (PERF-4).

---

## 0. Production topology (know this cold)

```
Internet
   │
   ▼
Cloudflare (Free plan)  ── TLS termination at edge, DNS, WAF, Under Attack Mode,
   │                        cache, "Always Online", Notifications
   ▼  (origin pull, TLS via Origin CA)
nginx on host  ── TLS, real-IP restore, reverse proxy
   │
   ▼  http://127.0.0.1:8000
Docker container "web"  ── uvicorn, 2 workers (WEB_CONCURRENCY=2)
   │
   ▼
SQLite (WAL mode), bind-mounted ./data  ── content reseeded from git on every start
                                        ── sync_blob (UX-4) is NOT: durable user state
```

- **VPS:** `203.0.113.11` — **2 vCPU / 2 GB RAM / NO SWAP**. The no-swap fact
  matters for OOM: there is zero cushion, the kernel OOM-killer fires immediately.
- **Repo on host:** `/opt/discammer` (`REPO_DIR`).
- **Compose:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml`.
- **Health:** `https://discammer.com/api/health` — liveness + DB connectivity +
  seed check, reports the deployed short SHA.
- **Metrics:** `/api/metrics` — Prometheus RED metrics, token-gated; closed (404)
  to non-loopback callers when `METRICS_TOKEN` is unset.

### Access

- **You do not have direct SSH.** The host is reached via two GitHub Actions:
  - **`diagnostics.yml`** — read-only host/container snapshot (manual dispatch).
  - **`ci-cd.yml`** — build + deploy (`deploy.sh`) on push to `main`.
- If you *do* have an SSH session (operator with the key), the commands below run
  directly on the box; otherwise run them through `diagnostics.yml` (read-only) and
  through a `main` push / deploy re-run (write).

---

## 1. Severity triage

Decide severity in the first 60 seconds, then act.

| Sev | Definition | Examples | Response |
|-----|------------|----------|----------|
| **SEV-1** | Site fully down / data at risk | origin 5xx for all users, OOM crash-loop, disk full, DB corruption | Drop everything. Mitigate now, then diagnose. Notify operator. |
| **SEV-2** | Degraded but serving | high latency, partial 5xx, one page broken, traffic spike not yet saturating | Mitigate within the hour. Diagnose root cause. |
| **SEV-3** | Cosmetic / non-urgent | stale cache, single asset 404, cert expiring >7 days out | Schedule a fix; no emergency. |

**First moves for any suspected outage:**

```bash
# 1. Is the edge serving at all? (from anywhere)
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://discammer.com/api/health

# 2. Is it CF or origin? Compare edge vs direct-to-origin (bypass CF).
#    Resolve discammer.com straight to the VPS IP, skip the edge:
curl -sS -o /dev/null -w "ORIGIN %{http_code} %{time_total}s\n" \
  --resolve discammer.com:443:203.0.113.11 https://discammer.com/api/health

# 3. Read the headers — cf-cache-status / server tells you who answered.
curl -sSI https://discammer.com/ | grep -iE 'server|cf-cache-status|cf-ray|cache-control'
```

- Edge OK **and** origin OK → look at a *specific* page/route, not the platform.
- Edge OK **but** origin 5xx/timeout → origin incident (§3, §4, §5). CF may still
  be serving cached/Always-Online pages — see §3.
- Edge fails too → likely CF-side or DNS; check
  [Cloudflare Status](https://www.cloudflarestatus.com/) and the CF dashboard.

---

## 2. L7 DDoS / traffic spike

**TRIGGER**
- Sudden latency climb + 5xx; `docker stats` CPU pinned ~100% on both cores.
- CF dashboard → **Security → Events** shows a flood from few IPs/ASNs or one path.
- UptimeRobot/Healthchecks alert fires for `/api/health` 5xx/timeout.

**DIAGNOSE**
```bash
# CF dashboard: Analytics → Traffic (requests/sec), Security → Events (top IPs,
# paths, ASNs, user-agents). This is the authoritative view — the flood may never
# reach origin if CF is already absorbing it.

# On origin (via diagnostics.yml or SSH): is the box actually saturated?
docker stats --no-stream                     # CPU% / MEM% of the web container
tail -n 200 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head
tail -n 100 /var/log/nginx/error.log         # upstream timeouts, worker exhaustion
```
Distinguish **DDoS** (many requests, often one path, abnormal UA/ASN) from
**legit spike** (organic, spread across pages, referrer = a real source).

**MITIGATE**
1. **Cloudflare → Under Attack Mode** (fastest blunt instrument):
   - Dashboard → the `discammer.com` zone → **Overview** → set **Security Level**
     to **"I'm Under Attack"**. This injects a JS/interstitial challenge for every
     visitor — bots without a JS engine are dropped at the edge before reaching us.
   - **Disable it** the same way (set Security Level back to **Medium**) the moment
     traffic normalizes — it hurts real-user UX and SEO crawlers.
2. **Targeted block / rate-limit** (surgical, preferred if the source is narrow):
   - Security → **WAF → Custom rules**: block by IP / ASN / country / path
     (e.g. `(ip.src eq <bad ip>)` → *Block*, or `(http.request.uri.path contains
     "/api/search")` → *Managed Challenge*).
   - Security → **Rate limiting rules** (Free includes one rule): e.g. limit
     `/api/*` to N req/min per IP → *Block* for a period. Set N from the measured
     headroom in [`capacity.md`](../deploy/capacity.md), not a guess.
3. App/nginx-level rate-limit is tracked separately (SEC-2 / CF-6) — this runbook
   uses the CF edge controls that exist today.

**VERIFY**
```bash
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://discammer.com/api/health
docker stats --no-stream            # CPU back to normal
```
CF Security Events drops; origin CPU falls; `/api/health` p95 back to baseline.

**ESCALATE**
- Sustained attack beyond Free-plan controls → consider CF Pro (more WAF/rate rules)
  or contact CF support (§9). If origin IP is leaking, rotate it and lock nginx to
  only accept CF IP ranges (CF-8 real-IP work).

---

## 3. Origin down / 5xx

**TRIGGER**
- `/api/health` returns 5xx/000 direct-to-origin (step 2 of §1) but CF may still
  show pages.
- Deploy log reports `ROLLBACK DID NOT RECOVER` or `site may be DOWN`.

**DIAGNOSE**
```bash
# Container alive? crash-looping?
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker inspect -f 'RestartCount={{.RestartCount}} Status={{.State.Status}} OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}' \
  "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)"

# What did the app say before/while dying?
docker logs --tail 200 "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)" 2>&1 | tail -200

# Is nginx the problem (502/504 = upstream unreachable)?
tail -n 80 /var/log/nginx/error.log

# Full host picture in one shot:
gh workflow run diagnostics.yml --ref main && gh run watch
```
Check `OOMKilled=true` → go to §4. Check disk → §5. Otherwise app crash / bad deploy.

**MITIGATE**
1. **Restart the container** (clears a transient hang):
   ```bash
   cd /opt/discammer
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
2. **Roll back to the last-known-good image** (`:prev`). `deploy.sh` already
   auto-rolls-back on a failed health probe *during* a deploy, but to roll back
   **manually** (e.g. a bad build that passed the probe but is broken in prod):
   ```bash
   cd /opt/discammer
   IMG="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml config --images web | head -1)"
   docker tag "${IMG%%:*}:prev" "$IMG"
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
   ```
   See the **Rollback quick-reference** (§8).
3. **Re-deploy clean** from CI once you have a fix on `main`:
   - Re-run the latest `ci-cd.yml` deploy job from the Actions tab, **or** push the
     fix to `main` (push = deploy). `deploy.sh` builds, tags the running image
     `:prev`, recreates, health-probes 12×5s, and auto-rolls-back on failure.

**Cloudflare "Always Online" behavior during this incident:**
- If **Always Online** is enabled, CF serves the last crawled (Internet-Archive-
  backed) snapshot of static pages while origin is down — visitors see *something*
  instead of an error. **It does not save dynamic routes:** `/api/*`, search, and
  fresh content will not work, and the served HTML may be stale. Treat Always
  Online as a courtesy, **not** as "the site is up" — keep working the origin fix,
  and don't let it mask the outage from yourself (external pings hit `/api/health`,
  which Always Online does not serve, so your alert is still truthful).

**VERIFY**
```bash
curl -sS -o /dev/null -w "ORIGIN %{http_code} %{time_total}s\n" \
  --resolve discammer.com:443:203.0.113.11 https://discammer.com/api/health
curl -sS https://discammer.com/api/health   # should report the expected SHA
```
`/api/health` 200 direct-to-origin **and** through the edge; SHA is the one you
intended.

**ESCALATE**
- Rollback "DID NOT RECOVER" → the box needs hands. Run `diagnostics.yml`, page the
  operator with the SSH key. If image build itself is broken, the *old* container is
  left untouched by `deploy.sh` (it fails before recreate) — confirm it's still serving.

---

## 4. Concurrency flapping (the 2026-06-22 root cause)

**This is the signature incident.** On 2026-06-22 the site appeared "down"
intermittently. It was **NOT OOM.** Root cause: a **single uvicorn worker** blocking
on **SQLite write locks** — requests piled up behind a lock, the worker stopped
answering the health probe, the container looked dead, flapped, recovered, repeated.

**Fixed by** (`be687ca` / `e1720af`): SQLite **WAL mode**, `lru_cache` on markdown
rendering, **`WEB_CONCURRENCY=2`** (one worker per core), init/seed **flocks**, and a
self-healing `deploy.sh`. A recurrence means one of those regressed or load exceeded
2-worker headroom.

**TRIGGER**
- Intermittent health-probe failures / flapping `RestartCount` climbing, but
  `OOMKilled=false` and memory **not** maxed.
- Latency spikes correlated with writes; logs show `database is locked` /
  `SQLITE_BUSY` or stalled requests.

**DIAGNOSE**
```bash
# Worker count — must be 2. If it's 1, the fix regressed.
docker exec "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)" \
  sh -c 'ps -eo pid,cmd | grep -c "[u]vicorn"'
docker inspect "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)" \
  | grep -iE 'WEB_CONCURRENCY'

# Restart churn without OOM = classic flapping
docker inspect -f 'RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}}' \
  "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)"

# Lock contention in the app logs
docker logs --tail 300 "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)" 2>&1 \
  | grep -iE 'database is locked|SQLITE_BUSY|locked|timeout' | tail

# Confirm WAL is on
docker exec "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)" \
  sh -c 'sqlite3 /app/data/discammer.db "PRAGMA journal_mode;"' 2>/dev/null || true
```

**MITIGATE**
1. Confirm `WEB_CONCURRENCY=2` is set (env in `docker-compose.prod.yml`) and that
   **2** worker processes are running. If only 1, restore the env and recreate.
2. Confirm `PRAGMA journal_mode` is `wal`. If it reverted to `delete`, a writer
   blocks all readers — restore the WAL setup.
3. If under genuine write pressure, reduce write frequency / shed load via CF
   (Under Attack Mode or rate-limit `/api/*`, §2) to drain the queue.
4. Restart to clear a wedged worker:
   `docker compose ... up -d`.

**VERIFY**
- `RestartCount` stops climbing; `/api/health` p95 stable over several minutes;
  no `database is locked` in fresh logs; 2 workers confirmed.

**ESCALATE**
- If 2 workers genuinely can't keep up, this is a **capacity** problem, not a bug:
  enable PERF-1 edge HTML caching to shed origin load, and re-run the load test
  (`scripts/loadtest/`) to find the new degradation point. Do **not** blindly raise
  `WEB_CONCURRENCY` — more workers on 2 GB/no-swap trades flapping for OOM (§4 vs §4OOM).

---

## 5. OOM (Out Of Memory)

**Context: 2 GB RAM, NO SWAP.** When memory is exhausted the kernel kills the
biggest process instantly — usually a uvicorn worker or the whole container. There
is no swap cushion, so OOM is abrupt.

**TRIGGER**
- `OOMKilled=true` on the container; `RestartCount` jumps after a memory climb.
- `docker stats` shows MEM% near 100% before a crash.
- dmesg shows `Out of memory: Killed process ... (uvicorn|python)`.

**DIAGNOSE**
```bash
free -m                                  # how tight is the host?
docker stats --no-stream                 # container MEM USAGE / LIMIT, MEM%
docker inspect -f 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}}' \
  "$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q web)"
# Kernel OOM-killer history (authoritative):
dmesg -T 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process|invoked oom' | tail -25
```

**MITIGATE (emergency)**
1. **Reduce workers to 1** to halve the app's memory footprint and stop the
   crash-loop:
   ```bash
   cd /opt/discammer
   # Set WEB_CONCURRENCY=1 in docker-compose.prod.yml (env), then:
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
   > **Trade-off:** 1 worker reinvites the §4 flapping risk under write load. This is
   > a *stop-the-bleeding* move — restore `WEB_CONCURRENCY=2` once memory pressure is
   > understood and resolved. You are choosing "slow" over "OOM-dead."
2. **Restart** to reclaim leaked memory immediately:
   `docker compose ... up -d` (or `restart web`).
3. **Shed load** at CF (§2) if a spike is driving allocation.
4. Free host memory if something else is eating it (check `free -m`, other
   processes); prune dead containers/images (§6) which can also relieve disk→tmpfs.

**VERIFY**
```bash
docker stats --no-stream     # MEM% with comfortable headroom
dmesg -T | grep -i oom | tail -3   # no new OOM lines after the fix
curl -sS -o /dev/null -w "%{http_code}\n" https://discammer.com/api/health
```

**ESCALATE**
- Recurring OOM with 2 workers = the app outgrew the box. Options: enable PERF-1
  edge caching (cuts render churn), profile memory, or resize the VPS / add swap.
  Adding even 1–2 GB swap turns abrupt OOM-kills into graceful slowdown — discuss
  with operator.

---

## 6. Disk full

**Context:** committed **media is ~15 GB**; Docker image layers + logs accumulate.
A full disk breaks SQLite writes (WAL checkpoint fails), nginx logging, and deploys.

**TRIGGER**
- Deploys fail writing layers; app errors writing DB; nginx can't log.
- `df -h` shows `/` or `/opt` near 100%.

**DIAGNOSE**
```bash
df -h / /opt
docker system df                 # space used by images / containers / volumes / build cache
du -sh /var/lib/docker/* 2>/dev/null | sort -rh | head
du -sh /var/log/* 2>/dev/null | sort -rh | head
du -sh /opt/discammer/* 2>/dev/null | sort -rh | head     # media bulk lives here
```

**MITIGATE**
1. **Prune Docker** — the usual culprit (old layers / build cache). The `:prev`
   rollback tag survives `prune -f` (only dangling images are removed):
   ```bash
   docker image prune -f                 # dangling layers (safe; keeps :prev)
   docker builder prune -f               # build cache (often the biggest win)
   docker system df                      # confirm reclaimed
   ```
   `deploy.sh` already runs `docker image prune -f --filter "until=24h"` on healthy
   deploys; a wedged disk may have skipped it.
2. **Rotate/trim logs** if `/var/log` is large: truncate or rotate nginx logs
   (`logrotate`), and Docker JSON logs if not capped.
3. **Verify media isn't duplicated** under `/opt/discammer/.git` (LFS pointers vs
   real blobs) — the 15 GB should live once, served by nginx.

**VERIFY**
```bash
df -h / /opt        # comfortable free space restored
curl -sS -o /dev/null -w "%{http_code}\n" https://discammer.com/api/health
```

**ESCALATE**
- If media genuinely needs ~15 GB and the disk is too small, move media off-box
  (CF / R2 / object storage) or resize the volume. Don't `prune -a` blindly — it
  would drop the `:prev` rollback target.

---

## 7. Cert / TLS issues

Two TLS hops: **client→CF** (CF universal/edge cert) and **CF→origin** (nginx with a
**Cloudflare Origin CA** certificate).

**TRIGGER**
- Browser TLS errors; `curl` reports cert expired / name mismatch.
- CF error **526** (invalid origin cert) or **525** (SSL handshake failed) =
  CF↔origin TLS broken.

**DIAGNOSE**
```bash
# Edge cert (client → CF):
echo | openssl s_client -connect discammer.com:443 -servername discammer.com 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates

# Origin cert (CF → nginx), bypass the edge:
echo | openssl s_client -connect 203.0.113.11:443 -servername discammer.com 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates

nginx -t                                  # config valid?
tail -n 40 /var/log/nginx/error.log | grep -iE 'ssl|cert'
```
- **CF SSL/TLS mode** must be **Full (strict)** (CF validates the origin cert).
  Check CF dashboard → SSL/TLS → Overview. If it's "Flexible," origin↔CF is plaintext
  — fix the mode, don't downgrade.

**MITIGATE**
1. **Origin cert expired/invalid (525/526):** reissue a **Cloudflare Origin CA**
   cert (CF dashboard → SSL/TLS → Origin Server → Create Certificate, up to 15-year
   validity), install the cert+key on nginx, `nginx -t`, then
   `systemctl reload nginx`. Keep CF SSL mode at **Full (strict)**.
2. **Edge cert problem:** CF manages the universal cert automatically; if it's
   stuck, re-trigger in CF SSL/TLS → Edge Certificates, or contact CF support (§9).
3. **As a last resort to restore service** while reissuing the origin cert, you may
   temporarily set CF SSL mode to **Full** (non-strict) — note this disables origin
   cert validation, so revert to **Full (strict)** immediately after.

**VERIFY**
- `openssl` shows a valid, in-date cert on both hops; site loads with no warning;
  no 525/526 in CF analytics.

**ESCALATE**
- Edge cert provisioning stuck on CF side → CF support (§9).

---

## 8. Rollback & quick-reference commands

```bash
# ── ROLL BACK to last-known-good image (:prev) ──────────────────────────────
cd /opt/discammer
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
IMG="$($COMPOSE config --images web | head -1)"
docker tag "${IMG%%:*}:prev" "$IMG"
$COMPOSE up -d --no-build
curl -fsS http://127.0.0.1:8000/api/health && echo " OK"

# ── RESTART the app ─────────────────────────────────────────────────────────
$COMPOSE up -d            # recreate if needed
$COMPOSE restart web      # plain restart

# ── RE-DEPLOY from main (push = deploy; or re-run the deploy job in Actions) ──
git -C /opt/discammer fetch origin main && git -C /opt/discammer reset --hard origin/main
bash /opt/discammer/scripts/deploy.sh    # builds, tags :prev, recreates, health-probes, auto-rollback

# ── READ-ONLY host snapshot (no SSH needed) ─────────────────────────────────
gh workflow run diagnostics.yml --ref main && gh run watch

# ── HEALTH checks ───────────────────────────────────────────────────────────
curl -sS -o /dev/null -w "EDGE   %{http_code} %{time_total}s\n" https://discammer.com/api/health
curl -sS -o /dev/null -w "ORIGIN %{http_code} %{time_total}s\n" \
  --resolve discammer.com:443:203.0.113.11 https://discammer.com/api/health

# ── CLOUDFLARE Under Attack Mode is a dashboard toggle ──────────────────────
#   Overview → Security Level → "I'm Under Attack"  (revert to Medium after)
```

---

## 9. External alerting setup

We currently learn about incidents post-hoc. Wire up **both** an external uptime
ping **and** Cloudflare's own notifications.

### 9.1 External uptime monitor (UptimeRobot or Healthchecks.io — free)

Goal: alert within **1–2 minutes** on `/api/health` 5xx/down, via Telegram/email.
`/api/health` is the right target because it checks DB + seed (not just TCP) and it
is **not** served by CF "Always Online," so the alert stays truthful during an
origin outage.

**Option A — UptimeRobot (simplest):**
1. Create an **HTTP(s)** monitor → URL `https://discammer.com/api/health`.
2. Interval **1 minute**; "alert when down" + optionally keyword check for
   `"ok"`/expected JSON so a 200-with-error-body still alerts.
3. Add **alert contacts**: email + **Telegram** (UptimeRobot has a native Telegram
   integration) — connect the `@uptimerobot` bot to your channel/DM.
4. Optionally add a second monitor hitting origin directly via a Cloudflare-bypass
   hostname so you can tell "edge down" from "origin down."

**Option B — Healthchecks.io (push or check):**
- Healthchecks is primarily a dead-man's-switch (cron pings); for HTTP-uptime use
  its **"check" with a HTTP request** or pair it with a tiny cron on the host that
  `curl`s `/api/health` and pings the check URL on success. Notifications route to
  Telegram/email/Slack.

> Whatever you pick, **test it** by inducing a controlled failure on staging (stop
> the container) and confirm the alert lands in ≤2 min (REL-2 DoD).

### 9.2 Cloudflare Notifications

CF dashboard → **Notifications → Add**. Enable at least:
- **Origin Error Rate** (HTTP 5xx) — fires when origin starts failing even if CF is
  still serving cache. This is your earliest "origin is sick" signal.
- **Health Checks** status (if a CF Health Check is configured — Pro feature; on
  Free, rely on the external monitor in §9.1).
- **Security Events Alert / spike** — surge in WAF/firewall events = likely §2 DDoS.
- Route to email (and/or a webhook → Telegram).

### 9.3 OBS-1 error-tracking signals (on `/api/metrics`)

OBS-1 extends the existing privacy-scrubbed pipeline rather than standing up a
third-party error tracker (GlitchTip/Sentry). Two extra series on the already
token-gated `/api/metrics` surface make 5xx spikes, new error types, and
post-deploy regressions visible and alertable — **without** collecting any new
user data. Both are fed from the two error signals that already exist (the
middleware 5xx branch and the scrubbed client-error beacon); no new client field
is collected and the beacon still stores nothing. **Status: implemented** (source
+ tests in `backend/metrics.py`, `backend/main.py`,
`backend/tests/test_metrics.py`).

- **`discammer_error_events_total{source,kind}`** (counter):
  - `source` is `"server"` or `"client"` only.
  - A **rising `source="server"` rate = a 5xx spike** — the same event the origin
    error runbook (§3) covers, now countable per error `kind`.
  - A **brand-new `kind` value = a new error type** just appeared (a fresh
    exception class on the server, or a new scrubbed crash class on the client).
  - `kind` is a bounded/guarded exception class name (server) or the already
    allowlisted scrubbed error name (client) — **never** a message, stack, URL,
    query string, IP, or any user content. Server `kind` is length- and
    identifier-guarded (`_safe_error_kind`) so it can never widen cardinality;
    anything unexpected buckets to `"Other"`.
- **`discammer_build_info{version,git_sha}`** (constant-1 gauge): the deployed
  `version` + short `git_sha`, so a dashboard/alert can **correlate an error
  spike with the release** that introduced it (post-deploy regression detection).
  `git_sha` is a build identifier, not PII.

**Alerting (REL-2 wiring — owner configuration step).** These signals ride the
same notification paths set up in §9.1/§9.2:
- **5xx spike** → the external uptime monitor (§9.1) already alerts on
  `/api/health` 5xx/down, and **Cloudflare Origin Error Rate** (§9.2) is the
  earliest edge-side "origin is erroring" signal; a rising `source="server"`
  error rate on `/api/metrics` is the origin-side confirmation and lets you see
  *which* `kind` is spiking.
- **New error type** → alert on a previously-unseen `kind` label appearing (or a
  step change in `discammer_error_events_total`), routed to the same
  Telegram/email contacts.
- Wiring the specific alert rules (thresholds, new-label detection) into
  UptimeRobot/Cloudflare Notifications is the operator's **configured** step and
  is only **production verified** once a dated external check confirms an alert
  actually fires (induce a controlled failure on staging, per the REL-2 DoD in
  §9.1).

> Reaching `/api/metrics` requires the `METRICS_TOKEN` bearer (or a loopback
> caller); it stays closed (404) to the public otherwise (§0). Scrape it from a
> trusted collector — do not expose it publicly.

---

## 10. Cloudflare support contact

- **Free plan = community support**, not 24/7 ticketing. First stops:
  - **Status:** <https://www.cloudflarestatus.com/> (check before assuming it's us).
  - **Community:** <https://community.cloudflare.com/>.
  - **Dashboard → Support / Help** → open a ticket (response is best-effort on Free).
- For anything requiring SLA-backed or live support (sustained attack, edge cert
  provisioning stuck), **upgrading to Pro/Business** unlocks faster channels —
  weigh during a prolonged SEV-1.
- Keep account/zone identifiers handy (Zone ID is recorded as a GitHub secret
  `CF_ZONE_ID`, see [`secrets.md`](./secrets.md)).

---

## 11. RPO / RTO

See [`docs/ops/backups.md`](./backups.md) (REL-1) for the authoritative backup
RPO/RTO and the restore procedure (`scripts/restore-db.sh`). Summary for incident
context: content is reseeded from git on every container start, so **that half** of
a lost DB self-heals. **`sync_blob` does not.** Since UX-4 the DB carries durable
user state — opt-in, client-encrypted course progress — and it exists nowhere else:
only the learner holds the decryption key, so we cannot rebuild a blob from any
artefact we hold, and with no email on file we cannot even notify the people
affected.

Operationally this means:

- A DB-loss incident is a **user-data incident**, not just a content outage. Do
  not let a green `/api/health` and correctly reseeded content close it — those
  will both look fine on an empty `sync_blob`.
- **Restore from the latest R2 backup before declaring recovery.** Starting the
  container on a fresh DB will happily serve a perfect-looking site that has
  quietly dropped every synced learner.
- Everything between the last snapshot and the loss is gone for good (RPO ≈ 24 h).
  Affected learners still hold their own local copy on the device they synced from,
  and that copy is what restores the blob — but **do not count on it coming back
  quickly, and do not describe it to anyone as a recovery step they can take.**
  `ProgressSync` has no push button (spec §6.2 chose auto-push over a "save"
  button deliberately), so re-upload happens only as a **side effect** of the
  learner making further progress: finishing a lesson, an exam, or a guide check
  fires the auto-push that recreates the blob. Concretely, on a still-linked
  device: opening the course pushes nothing; "Refresh from server" only pulls and
  will show not-found. Worse, the **re-link path is blocked once the blob is
  gone** — re-entering a code calls `pullProgress`, and the UI deliberately
  refuses to link on not-found, so a learner who unlinked (or switched device)
  cannot re-attach that code at all. The learner with the most to lose — one who
  finished the course, whose blob carries the exam result and `certName` — has no
  remaining coursework to trigger a push with.
- The honest summary for a status update: restoring from backup is **our** job and
  the only recovery we control. There is no user-facing "re-sync" action to point
  people at. If the restore fails, an affected learner's server-side copy returns
  only if they happen to do more coursework on a still-linked device; their local
  progress is untouched either way, so nobody loses the course itself.
