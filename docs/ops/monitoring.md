# OBS-2 — Metrics dashboards & alerts (Prometheus + Grafana)

**Status: configured.** The repo ships a self-contained, opt-in observability
stack (`docker-compose.observability.yml` + `deploy/prometheus/` +
`deploy/grafana/`). It is **not production-verified** — only the owner bringing
it up against the live app and a dated check of real scrapes can claim that.
Bringing it up and wiring alert routing are **owner steps**.

The app already exposes the metrics; this stack only scrapes and visualizes them.
Nothing here changes a normal `docker compose up` — it is a separate compose
project (`-p discammer-obs`) that defines no `web` service.

## What is scraped

`GET /api/metrics` on the app (RED + product metrics from `backend/metrics.py`):

| Series | Labels | Source |
| --- | --- | --- |
| `discammer_requests_total` | method, route, status_class | RED |
| `discammer_errors_total` (5xx only) | method, route, status_class | RED |
| `discammer_request_duration_seconds_{bucket,sum,count}` | method, route | RED |
| `discammer_surface_views_total` | surface, lang | AN-1 |
| `discammer_error_events_total` | source, kind | OBS-1 |
| `discammer_build_info` (=1) | version, git_sha | OBS-1 |

## ⚠ Multi-worker scrape caveat (important)

The app runs **2 uvicorn workers** (`WEB_CONCURRENCY=2`) and the collector is
**in-process**, so there are **two independent metric sets** behind the single
`web:8000` port. Each scrape is load-balanced to one worker at random.

- **Counters** (`*_total`): a point-in-time value is only one worker's tally, so
  it can appear to move non-monotonically between scrapes. Treat
  `rate()`/`increase()` over a window (the dashboards use 5m) as **sampled but
  directionally correct** — both workers see similar traffic.
- **For exact counts**: run the app with `WEB_CONCURRENCY=1`, or move to a
  shared/multiprocess collector (out of scope). The dashboards and alerts here
  are all rate-over-5m so they tolerate the split.

## Access model

`/api/metrics` is gated (`backend/main.py`):

- `METRICS_TOKEN` set → caller must send `Authorization: Bearer <token>`.
- `METRICS_TOKEN` unset → only a **loopback** caller may scrape; others get 404.

Prometheus scrapes `web:8000` over the docker bridge (not loopback), so it uses
the **token** path. Provision it:

```bash
# 1. Set METRICS_TOKEN on the app (host .env / compose env), redeploy.
# 2. Mirror it into the gitignored token file Prometheus mounts:
cp deploy/prometheus/metrics_token.example deploy/prometheus/metrics_token
printf '%s' "$METRICS_TOKEN" > deploy/prometheus/metrics_token   # no trailing newline
```

The real `deploy/prometheus/metrics_token` is gitignored — only the `.example`
placeholder is committed. Grafana's admin password is a **required env var**
(`GF_ADMIN_PASSWORD`); compose refuses to start without it, so no credential is
ever committed.

Alternative (no token): point the scrape at `host.docker.internal:8000` with the
app published on the host's `127.0.0.1:8000` and drop the `authorization` block
in `prometheus.yml`.

## Bring it up

```bash
export GF_ADMIN_PASSWORD='…'                 # required; never commit it
export METRICS_TOKEN='…'                      # same value as the app
export APP_NETWORK='discammer_default'        # the app's compose network name

docker compose -f docker-compose.observability.yml -p discammer-obs up -d
```

Both services bind **loopback only** (`127.0.0.1:9090` Prometheus,
`127.0.0.1:3000` Grafana) — never expose them publicly. Reach them over an SSH
tunnel, or put Cloudflare Access (Zero Trust) in front (see
[staging.md](staging.md) for the same pattern). Grafana auto-provisions the
Prometheus datasource and the **DiScammer — RED** dashboard from
`deploy/grafana/`.

Tear down: `docker compose -f docker-compose.observability.yml -p discammer-obs down`.

## Alerts

`deploy/prometheus/alerts.yml` defines the rules (loaded by Prometheus). They
DEFINE what fires, not where it goes — routing to a receiver (Alertmanager →
Telegram/email) is the owner's step, tied to the incident runbook
([runbook.md](runbook.md), REL-2):

| Alert | Fires when | Severity |
| --- | --- | --- |
| `DiscammerAppDown` | `up == 0` for 3m (origin down / metrics unreachable) | critical |
| `DiscammerNoMetrics` | scrape target absent for 5m | critical |
| `DiscammerHigh5xxRate` | 5xx share > 5% for 10m | warning |
| `DiscammerLatencyP95High` | p95 > 1s for 10m | warning |
| `DiscammerClientErrorSpike` | client error events > 1/s for 15m (correlate with `build_info`) | info |

Thresholds are starting points — calibrate against the PERF-4 capacity baseline
(`docs/deploy/capacity.md`) once real traffic numbers exist.
