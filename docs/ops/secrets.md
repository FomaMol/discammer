# Secrets inventory & rotation (SEC-3)

Every secret DiScammer relies on, where it lives, its blast-radius, and how to
rotate it. Goal: **minimal privilege** (scoped tokens) and a known, repeatable
rotation drill so a leak is contained, not catastrophic.

> Related: deploy mechanics in [`scripts/deploy.sh`](../../scripts/deploy.sh);
> incident handling in [`docs/ops/runbook.md`](./runbook.md) §10 (CF contact).

---

## Inventory

| Secret | Stored in | Used by | Scope / privilege | Exposure if leaked |
|--------|-----------|---------|-------------------|--------------------|
| `DEPLOY_SSH_KEY` | GitHub → repo → Settings → Secrets → Actions (env `production`) | `ci-cd.yml`, `diagnostics.yml` (via `appleboy/ssh-action`) | SSH login to the VPS deploy user | **High** — full host access. The crown jewel. |
| `DEPLOY_HOST` / `DEPLOY_USER` | same (GitHub Actions, env `production`) | same | host IP + login user | Low alone (public-ish), but pairs with the key |
| `METRICS_TOKEN` | host env (`docker-compose.prod.yml`) — **currently unset** | `backend/main.py` `/api/metrics` gate | Bearer token for `/api/metrics` | Low — read-only Prometheus RED metrics, no PII |
| `CF_API_TOKEN` | GitHub Actions secret (env `production`) | `scripts/cf-purge-cache.sh` (called by `deploy.sh`) | **Cache Purge + Zone Read, `discammer.com` zone only** | Low if scoped correctly (can only purge cache + read zone config) |
| `CF_ZONE_ID` | GitHub Actions secret (env `production`) | `scripts/cf-purge-cache.sh` | Identifier (not a credential) | Negligible — it's an ID, not a secret per se; kept as a secret for tidiness |

---

## `DEPLOY_SSH_KEY`

The highest-value secret: it grants shell on the production host. Treat any
suspected leak as a **SEV-1 host compromise** (runbook).

- **Best practice now:** dedicated key for CI only (not your personal key);
  restrict the authorized key on the host (`from=`, `command=`, no agent
  forwarding) where practical; deploy user has only what the deploy needs.
- **Rotate:**
  1. Generate a new keypair: `ssh-keygen -t ed25519 -C "discammer-deploy-$(date +%Y)" -f deploy_key`.
  2. Add the **public** key to the host deploy user's `~/.ssh/authorized_keys`.
  3. Update the `DEPLOY_SSH_KEY` GitHub secret with the new **private** key.
  4. Trigger a deploy / run `diagnostics.yml` to confirm CI can still reach the box.
  5. **Remove the old public key** from `authorized_keys`. (Don't skip — rotation
     isn't done until the old key is dead.)
- **On suspected leak:** remove the key from `authorized_keys` immediately, rotate,
  and audit host auth logs / recent deploys.

## `METRICS_TOKEN`

`/api/metrics` is **closed to non-loopback callers (404) when this is unset** — the
current state — which is acceptable: only the local host (nginx / a sidecar scraper)
can reach it.

- **Decision rule:** if `/api/metrics` ever needs to be reachable **through
  Cloudflare** (e.g. an external scraper), then **either**:
  1. **set `METRICS_TOKEN`** to a strong random value and require
     `Authorization: Bearer <token>`, **or**
  2. **block `/api/metrics` at the CF WAF** (defense-in-depth) so the edge never
     forwards it. _Recommended: do **both** — block at WAF and keep loopback-only._
- **CF WAF rule (SEC-3 DoD — block `/api/metrics` externally):**
  Security → WAF → Custom rules → expression
  `(http.request.uri.path eq "/api/metrics")` → **Block**. This holds regardless of
  the token, so an accidental future exposure can't leak metrics.
- **Generate / rotate the token:** `openssl rand -hex 32`, set it in the host env
  (`docker-compose.prod.yml` / deploy env), recreate the container. Rotation is just
  setting a new value and restarting; update any scraper config in lockstep.

## `CF_API_TOKEN` (Cloudflare API token — for cache purge, CF-5)

Consumed by **`scripts/cf-purge-cache.sh`**, which `deploy.sh` calls to purge the
edge cache after a deploy. **Scope it to exactly two permissions, one zone** — no
DNS, no firewall, no account-level rights.

- **Create (CF dashboard → My Profile → API Tokens → Create Token → Create Custom Token):**
  - **Permissions (exactly these two — no more):**
    - `Zone` → **Cache Purge** → **Purge**
    - `Zone` → **Zone** → **Read**
  - **Zone Resources:** **Include → Specific zone → `discammer.com`** (never "All zones").
  - Optionally set **Client IP Address Filtering** to GitHub Actions egress ranges
    and a short **TTL** for extra containment.
- **Why this scope:** a leaked token can only purge cache and read this one zone's
  config — it cannot change DNS, disable security, or touch other zones. Blast radius
  ≈ "someone can force cache purges," which is annoying, not dangerous.
- **Store:** put the token value in GitHub secret `CF_API_TOKEN` and the zone's ID in
  `CF_ZONE_ID` (env `production`).
- **Rotate:** create a new token with the same scope → update the `CF_API_TOKEN`
  secret → run a deploy to confirm `cf-purge-cache.sh` still succeeds → **delete the
  old token** in the CF dashboard.
- **Verify scope after creation:** the token's summary should read exactly
  "Cache Purge:Purge, Zone:Read — discammer.com". Anything broader is a finding.

## `CF_ZONE_ID`

The `discammer.com` zone identifier (CF dashboard → zone → Overview → API section,
right rail). Not a credential, but kept as a GitHub secret alongside `CF_API_TOKEN`
for consistency. No rotation needed unless the zone is recreated.

---

## Repository hygiene (GitHub)

Enable on the repo (Settings → Code security and analysis):

- **Secret scanning** — detects committed credentials (incl. provider patterns like
  CF tokens) and **Push protection** — blocks the push before a secret lands.
- **Dependabot** — **alerts** + **security updates** for vulnerable dependencies
  (`requirements.txt`, `frontend/package.json`), complementing the existing
  `pip-audit` / `npm audit` CI steps (SEC-4).
- Keep all the above secrets in **GitHub Actions secrets** scoped to the
  **`production` environment** (with required reviewers if desired), never in code,
  `.env` committed files, or workflow YAML literals.

> Reminder: `diagnostics.yml` mirrors `docker logs` into the (retained) Actions log.
> Today the container carries no secret env and app logs hold no PII (see the note in
> `scripts/deploy.sh`). **If app logging ever starts emitting tokens/headers/request
> bodies, scrub the log tail** — otherwise it surfaces in CI on every run.

---

## Annual rotation checklist

Run once a year (or immediately on any suspected leak). Tick each:

- [ ] **`DEPLOY_SSH_KEY`** — new keypair generated; public key added to host;
      GitHub secret updated; deploy verified; **old public key removed** from
      `authorized_keys`.
- [ ] **`CF_API_TOKEN`** — new token created with **exactly** `Cache Purge:Purge` +
      `Zone:Read` on **`discammer.com` only**; secret updated; deploy/purge verified;
      **old token deleted** in CF.
- [ ] **`CF_ZONE_ID`** — confirm still correct (only changes if the zone is recreated).
- [ ] **`METRICS_TOKEN`** — if set: rotated (`openssl rand -hex 32`) and scraper
      updated; if unset: confirm `/api/metrics` is still loopback-only **and** the CF
      WAF block on `/api/metrics` is in place.
- [ ] **GitHub** — secret scanning + push protection + Dependabot still enabled;
      review any open Dependabot alerts.
- [ ] **Audit** — review who has access to the GitHub `production` environment and the
      CF account; remove anyone who shouldn't.
- [ ] **Confirm no plaintext leaks** — `git log -p`/secret-scan history clean; no
      secrets in deploy logs.
- [ ] Record completion date here: `last rotated: TODO`.
