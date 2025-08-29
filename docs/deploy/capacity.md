# Capacity baseline (PERF-4)

Records how much load the origin holds (2 vCPU / 2 GB / **no swap**, uvicorn with
`WEB_CONCURRENCY=2`) **before and after** the Cloudflare cache, so we can:

- size **rate-limit thresholds** (CF-6 / SEC-2) from real headroom, not guesses;
- size **alert thresholds** (OBS-2) — latency/error SLOs — from observed baselines;
- know our margin against traffic spikes and the §4 concurrency-flapping failure mode.

> Measured numbers below are **TODO placeholders** — the methodology is pre-filled.
> Run [`scripts/loadtest/smoke.js`](../../scripts/loadtest/README.md), then fill the
> tables and date them. Re-run after enabling PERF-1 (edge HTML cache) to capture the
> "after CF" column.

---

## Methodology

**Tool:** k6 — [`scripts/loadtest/`](../../scripts/loadtest/README.md). Same script
for every run; only `BASE_URL` / `--hosts` / `PROFILE` / `VUS` change.

**Traffic mix per VU iteration** (one of each, 1–3s think-time between iterations):
SSR `/en/` · `/api/posts` · `/api/search?q=<term>` · media `/static/images/og/discammer-og.png`.

**Two environments, run each identically:**

| Run | How | Tells us |
|-----|-----|----------|
| **Through CF** | `BASE_URL=https://discammer.com` | What real users experience (edge cache + WAF) |
| **Direct to origin** | `--hosts discammer.com:203.0.113.10` (keeps Host header) | True origin capacity, cache bypassed |

**Procedure:**

1. Confirm the box is healthy first (`curl .../api/health`, `docker stats`).
2. **Smoke** profile first (gentle) to sanity-check the script and capture a
   light-load baseline.
3. **Stress** profile, ramping `VUS` in steps (10 → 25 → 50 → 100 → …). Stop at the
   first sustained rise in `errors` / `http_req_failed` — that VU/RPS is the
   **degradation point**. Do not drive it to total collapse on prod.
4. During each run, capture origin CPU/mem (`docker stats` via SSH, or
   `gh workflow run diagnostics.yml`) and grep app logs for `database is locked` /
   `SQLITE_BUSY`.
5. Record from the k6 end-of-test summary: per-class p50/p95/p99, error rate, and the
   achieved req/s. Note `cf-cache-status` HIT ratio for the through-CF run.

**Conditions to record with every result:** date, deployed SHA, profile, peak VUs,
through-CF vs direct, and whether PERF-1 edge HTML cache was enabled.

---

## Results

### Baseline — DIRECT TO ORIGIN (cache bypassed)

> Date: `TODO` · SHA: `TODO` · Profile/VUs: `TODO` · PERF-1 cache: `OFF`

| Class | p50 (ms) | p95 (ms) | p99 (ms) | Error rate | Notes |
|-------|---------:|---------:|---------:|-----------:|-------|
| SSR `/en/` | TODO | TODO | TODO | TODO | |
| `/api/posts` | TODO | TODO | TODO | TODO | |
| `/api/search` | TODO | TODO | TODO | TODO | heaviest API path |
| media (static) | TODO | TODO | TODO | TODO | |
| **Aggregate** | TODO | TODO | TODO | TODO | |

- **Sustained RPS at the knee:** `TODO`
- **Origin CPU at the knee:** `TODO` (both cores → ~`TODO`%)
- **Peak container memory:** `TODO` MB / 2048 MB

### Baseline — THROUGH CLOUDFLARE

> Date: `TODO` · SHA: `TODO` · Profile/VUs: `TODO` · PERF-1 cache: `OFF` then `ON`

| Class | p50 (ms) | p95 (ms) | p99 (ms) | Error rate | `cf-cache-status` HIT% | Notes |
|-------|---------:|---------:|---------:|-----------:|----------------------:|-------|
| SSR `/en/` | TODO | TODO | TODO | TODO | TODO | |
| `/api/posts` | TODO | TODO | TODO | TODO | TODO | API usually bypasses cache |
| `/api/search` | TODO | TODO | TODO | TODO | TODO | |
| media (static) | TODO | TODO | TODO | TODO | TODO | should HIT heavily |
| **Aggregate** | TODO | TODO | TODO | TODO | — | |

### Before vs after CF cache (origin relief)

> Fill once PERF-1 edge HTML caching is enabled and re-measured through CF.

| Metric | Before CF cache | After CF cache | Δ |
|--------|----------------:|---------------:|---:|
| Origin RPS to serve same user load | TODO | TODO | TODO |
| Origin CPU at target load | TODO | TODO | TODO |
| SSR p95 (user-facing) | TODO | TODO | TODO |
| Degradation point (user RPS) | TODO | TODO | TODO |

---

## Degradation point

- **First sign of degradation (errors/p99 climbing):** `TODO` RPS / `TODO` VUs
  (direct-to-origin). _The expected first bottleneck is the **SSR render** on 2
  cores — CPU-bound Jinja — not the static/media path._
- **Hard ceiling (sustained 5xx / health-probe failures):** `TODO` RPS.
- **Headroom over typical traffic:** `TODO`× (typical = `TODO` RPS).

## Behavior under WAL locks

SQLite is in **WAL** mode (one writer, many readers — see runbook §4). Record what
the search/posts read load does under concurrency:

- `database is locked` / `SQLITE_BUSY` observed at: `TODO` RPS / `TODO` VUs (or
  "none observed up to the test ceiling").
- Latency tail (p99) behavior as concurrency rises: `TODO`.
- Whether the §4 **concurrency-flapping** signature reproduced (health probe
  stalling, `RestartCount` climbing without OOM): `TODO`.

> If WAL contention shows up well below CPU saturation, that — not CPU — is the real
> ceiling, and PERF-1 caching (fewer origin reads) is the highest-leverage fix.

---

## How these numbers feed thresholds

### Rate-limit thresholds (CF-6 / SEC-2)

Set the **edge** (CF rate-limiting rule) and **app/nginx** (`limit_req`) limits below
the origin degradation point so a single abusive client can't push the box past it:

- **Per-IP `/api/*` limit:** start at ~`min(measured safe per-IP RPS, total knee / expected concurrent clients)`.
  Record the chosen value here once measured: `TODO` req/min per IP.
- **`/api/search` (heaviest):** a tighter bucket than other `/api/*` — value: `TODO`.
- Document the final numbers in the SEC-2 / CF-6 change and link back to this table so
  the limit is traceable to data.

### Alert thresholds (OBS-2)

Derive SLO alerts from the **healthy through-CF baselines** (plus margin):

- **Latency alert:** p95 SSR > `~1.5–2×` baseline p95 (`= TODO` ms) for N minutes.
- **Error-rate alert:** 5xx rate > `TODO`% over 5 min (baseline is ~0%).
- **Saturation alert:** origin CPU > `TODO`% sustained — early warning before the
  knee. (CF Origin-Error-Rate notification, runbook §9.2, covers the 5xx side.)

---

## Change log

| Date | SHA | What changed | Headline result |
|------|-----|--------------|-----------------|
| TODO | TODO | First baseline (no CF cache) | TODO |
| TODO | TODO | After PERF-1 edge HTML cache | TODO |
