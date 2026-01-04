# REL-4 — Staging environment

**Status: configured.** The repo ships an isolated staging compose
(`docker-compose.staging.yml`) and a manual CI smoke
(`.github/workflows/staging.yml`). Standing up `staging.discammer.com`, putting
**Cloudflare Access** in front, and wiring an auto-deploy are **owner steps** —
nothing here is production-verified until that host exists and is checked.

## Why

Cloudflare rules (WAF / cache / CSP enforce), DB migrations, and any risky
change should land on staging first, not straight on prod. Staging is a full
copy of the app that **cannot touch prod data**.

## Isolation guarantees

`docker-compose.staging.yml` is an OVERRIDE run under its own project name:

```bash
# bring up (does not touch volumes)
docker compose -f docker-compose.yml -f docker-compose.staging.yml \
  -p discammer-stg up -d --build
# tear down, KEEPING volumes (the default)
docker compose -f docker-compose.yml -f docker-compose.staging.yml \
  -p discammer-stg down
```

> **Check `-p` before any `down`.** `down -v` also deletes the project's named
> volumes. Run it only by hand, deliberately, after confirming on the host which
> project is running: `docker compose ls`, then `docker compose -p <project> ps`.
>
> **Production uses this project name (owner decision, 2026-10-11).** The production
> stack on the EC2 host runs as compose project `discammer-staging`, the name that
> `.github/workflows/ci-cd.yml` uses for the production deploy. The owner keeps it.
> Renaming is a migration (new project, data move), not a one-line change. On the
> production host, never run `down` with `-p discammer-staging`, with or without `-v`.

- **Project name** (`discammer-stg`) → the network and container names of this stack.
  Never use `discammer-staging` for staging: it is production's project name (see the warning above).
- **Separate data dir** (`./data-staging`, gitignored) → its own SQLite db, so a
  staging reseed/migration can never erase prod's `./data`.
- **Loopback + distinct port** (`127.0.0.1:8001`) → not public. Front it with
  Cloudflare Access (below) or reach it over an SSH tunnel.

## CI smoke

`.github/workflows/staging.yml` is **manual (`workflow_dispatch`)** so it never
interferes with the `ci-cd.yml` pipeline. It builds the staging stack on the
runner, waits for `/api/health`, asserts a handful of canonical routes return
200, and tears down. Run it from the Actions tab before pointing staging at a
real host.

## Owner steps (not done here)

1. **DNS/subdomain**: add `staging.discammer.com` in Cloudflare, proxied,
   pointing at the staging origin (a separate host, not the production EC2 host;
   port 8001 behind nginx).
2. **Cloudflare Access (Zero Trust, free ≤ 50 users)**: lock the whole subdomain
   behind email-OTP so staging is never publicly reachable or indexable.
3. **Auto-deploy** (optional): add a gated staging-deploy job mirroring the prod
   `deploy` job in `ci-cd.yml`, keyed on staging SSH secrets, so `main` lands on
   staging automatically while prod stays behind the tag/approval gate.
4. **robots/noindex**: ensure staging is `noindex` (or Access-gated so crawlers
   never reach it) to avoid duplicate-content SEO issues.

## Promote to prod

Validate the change on staging (CF rule / CSP / migration), then let the normal
prod pipeline (`ci-cd.yml` → `deploy` → `smoke-prod`) ship it. Keep prod behind
its existing `production` environment gate.
