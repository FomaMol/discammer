# Load test (`scripts/loadtest/`)

A [k6](https://k6.io) script that exercises the four production traffic classes and
records latency/error baselines for **PERF-4** (capacity baseline). Results feed the
rate-limit thresholds (CF-6 / SEC-2) and alert thresholds (OBS-2) — record them in
[`docs/deploy/capacity.md`](../../docs/deploy/capacity.md).

> **It is deliberately gentle by default.** The default `smoke` profile peaks at ~5
> VUs so a stray `k6 run` will not knock over the 2-vCPU origin. You opt into real
> load with `PROFILE=stress VUS=...`.

## Install k6

```bash
brew install k6            # macOS
# or: https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## Run

```bash
# Default: gentle smoke against prod (https://discammer.com)
k6 run scripts/loadtest/smoke.js

# Explicit target
BASE_URL=https://discammer.com k6 run scripts/loadtest/smoke.js

# Exercise the script locally (start the dev server first; media will 404 — OK)
BASE_URL=http://127.0.0.1:8000 k6 run scripts/loadtest/smoke.js

# Push to find the degradation point (RUN WITH INTENT — see "Safety" below)
PROFILE=stress VUS=50 k6 run scripts/loadtest/smoke.js
```

### What it hits

| Class       | Path                                   | Why it's measured                          |
|-------------|----------------------------------------|--------------------------------------------|
| SSR HTML    | `/en/`                                 | Synchronous Jinja render — CPU-bound, the first thing to saturate 2 cores |
| API JSON    | `/api/posts`                           | SQLite read                                |
| API search  | `/api/search?q=...`                    | SQLite full-text read — heaviest API path; key rate-limit target |
| Media/static| `/static/images/og/discammer-og.png`   | Bytes off disk/edge, ~0 CPU — isolates I/O from render cost |

### Tunables (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `BASE_URL` | `https://discammer.com` | Target origin/edge |
| `PROFILE` | `smoke` | `smoke` (gentle) or `stress` (ramp to `VUS`) |
| `VUS` | `10` | Peak virtual users for the `stress` profile |
| `SSR_PATH` | `/en/` | SSR page to load |
| `POSTS_PATH` | `/api/posts` | Posts endpoint |
| `MEDIA_PATH` | `/static/images/og/discammer-og.png` | Media/static asset |
| `SEARCH_TERMS` | `scam,phishing,bank,romance,sms,crypto` | Comma list; one picked at random per iteration |

## Comparing through-CF vs direct-to-origin

The whole point of PERF-4 is to know origin headroom **and** how much Cloudflare's
cache buys us. Run the same script twice and diff the summaries:

```bash
# 1) THROUGH Cloudflare (what real users get — edge cache + WAF in front)
BASE_URL=https://discammer.com k6 run scripts/loadtest/smoke.js

# 2) DIRECT to origin (bypass CF — true origin capacity)
#    Point BASE_URL at the VPS IP but keep the Host header = discammer.com so
#    nginx routes correctly. Easiest: an /etc/hosts override or k6's --hosts:
BASE_URL=https://discammer.com \
  k6 run --hosts discammer.com:203.0.113.11 scripts/loadtest/smoke.js
```

- **Through CF**, SSR and media should show many `cf-cache-status: HIT`s (especially
  once PERF-1 micro-TTL HTML caching is enabled) → lower, flatter latency, origin
  barely touched.
- **Direct to origin** is the number that sets your safety margin: it's what the box
  survives when CF is bypassed or cache-cold.

## What to watch

- **p95 / p99** per class (k6 prints `http_req_duration` plus the custom
  `ssr_duration`, `api_posts_duration`, `api_search_duration`, `media_duration`).
- **`errors` and `http_req_failed` rate** — the knee where these climb is your
  **degradation point**. Note the VU/RPS at which it starts.
- **Origin CPU** during the run: in another terminal run the read-only host snapshot
  (`gh workflow run diagnostics.yml`) or `docker stats` if you have SSH — both cores
  near 100% = saturation.
- **WAL-lock behavior**: watch app logs for `database is locked` / `SQLITE_BUSY`
  during the search/posts load (see capacity.md "Behavior under WAL locks").

## Safety

- **Never** run the `stress` profile against prod during peak hours without telling
  the operator; it can trip your own CF rate-limit / Under Attack heuristics.
- Start small. Bump `VUS` in steps (10 → 25 → 50 → …) and stop at the first sign of
  rising errors — that's the data point you want, no need to drive it into the ground.
- If the run trips Cloudflare's bot/rate protections, that's a *finding*, not a bug —
  note the threshold and back off.
