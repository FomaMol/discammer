# Cloudflare Setup Runbook — DiScammer

**Audience:** the site owner. These are **external actions** — steps that require logging into the
Cloudflare dashboard and/or the domain registrar. They **cannot be automated** from the repo.

**Authoritative spec:** `FEATURE_PLAN.md` §2 (CF-1 … CF-9). This runbook is the click-by-click
execution of that spec. Where the plan and this file disagree, the plan wins — open an issue.

## Project facts (single source of truth for this doc)

| Thing | Value |
| --- | --- |
| Apex domain | `discammer.com` |
| WWW | `www.discammer.com` (redirects to apex) |
| Origin VPS | `203.0.113.11` · 2 vCPU / 2 GB RAM / **no swap** |
| TLS today | nginx on host terminates TLS — Let's Encrypt + certbot, HTTP/2 |
| App | Docker, uvicorn 2 workers, published **loopback-only** on `127.0.0.1:8000` (`docker-compose.prod.yml`) |
| Media | `/media/` (~15 GB) served **by nginx** from `/opt/discammer/media/` — NOT by the app. `Cache-Control: public, max-age=2592000, immutable` (30 d) |
| Static | `/static/js/`, `/static/css/` content-hashed (Vite) → `public, max-age=31536000, immutable`. Fonts `/static/fonts/*.woff2` self-hosted |
| Game | Unity WebGL under `/play/` with **brotli-precompressed `.br`** assets that carry explicit `Content-Encoding: br` from the app — **CF must NOT double-compress these** |
| HTML | language in path: `/en/...`, `/ru/...`; apex `/` redirects by `lang` cookie; SSR HTML sent with `Cache-Control: no-cache` |
| API | `/api/*` · `/api/metrics` is token-gated / loopback-only and **MUST be blocked from the public edge** |
| Privacy | brand promise — client-side checker, nothing leaves the device (e2e `assertNoNetworkLeak`). **NO Google Analytics.** Cloudflare Web Analytics (cookieless) is OK |

---

## ⚠️ Order of operations / critical warnings — ПОРЯДОК И ПРЕДУПРЕЖДЕНИЯ

> **Do these in order. The firewall lock-down (CF-8) is LAST.**
>
> 1. **CF-8 (origin firewall) goes LAST.** Lock the origin to Cloudflare IPs **only after** you have
>    confirmed real traffic is flowing through Cloudflare (`server: cloudflare` on responses, `cf-ray`
>    header present). Locking first = you cut yourself off.
> 2. **Keep SSH (`:22`) open from your own IP.** Every firewall step must whitelist your admin IP for
>    SSH. If you lose SSH and the firewall is wrong, you need console/KVM access from the VPS provider.
> 3. **Back up before risky changes.** Before touching nginx TLS (CF-3) or the firewall (CF-8):
>    `cp -a /etc/nginx /root/nginx.bak.$(date +%F)` and snapshot the VPS if your provider offers it.
> 4. **Add DNS records (CF-2) BEFORE flipping nameservers (CF-1 step 3).** Otherwise the zone goes
>    live with missing records → downtime.
> 5. **Have a rollback ready.** Keep the old registrar nameservers noted down. Keep certbot/LE working
>    on the origin until Origin CA + Full(strict) is verified green.
>
> Recommended sequencing: **CF-1 → CF-2 → CF-3 → CF-4 → CF-5 → CF-6 → CF-7 → CF-9 → (confirm traffic) → CF-8.**

**Plan:** start on **Cloudflare Free**. Free covers DDoS L3/4 (unmetered), Universal SSL, unlimited
CDN cache, the basic WAF managed ruleset, 1 rate-limit rule, 5 cache/config rules, and Web Analytics —
~90% of needs. Upgrade to **Pro ($20/mo)** only when you need: advanced WAF managed rulesets
(full OWASP core), Polish / Image Resizing, or fine-grained rate-limiting (multiple rules, per-path
thresholds). Each section below flags where Pro is required.

---

## CF-1 · Add site + nameservers + DNSSEC — Подключение домена

**Priority P0 · Low complexity.** Foundation: nothing else (DNS proxy, WAF, cache) works without it.

### Steps
1. Log into / create a Cloudflare account → **Add a site** → enter `discammer.com` → choose plan **Free**.
2. Cloudflare auto-scans existing DNS at your current registrar/host. **Compare the scanned list
   against your real records** — especially the apex `A` record and `www`. Note anything missing; you
   will add it in **CF-2 BEFORE flipping nameservers** so there is no downtime.
3. Cloudflare gives you **two** nameservers (e.g. `xxx.ns.cloudflare.com`). In your **registrar**
   control panel, replace the existing NS with these two and remove the old ones.
   - ✅ Do CF-2 first if any records are missing.
4. Wait for zone status **Active** (usually 1–4 h, up to 24 h).
5. Enable **DNSSEC**: Cloudflare → **DNS → Settings → Enable DNSSEC**. Copy the generated **DS record**
   and add it at your **registrar** (DNSSEC / DS section).

### Verify
```bash
dig NS discammer.com +short          # → ...ns.cloudflare.com (x2)
dig DS discammer.com +short          # → a DS record once DNSSEC propagates
curl -sI https://discammer.com | grep -i '^server'   # → server: cloudflare
```

**DoD:** zone is **Active**; `dig NS` returns Cloudflare nameservers; site loads through CF
(`server: cloudflare`); DNSSEC enabled and DS published at registrar.

---

## CF-2 · DNS records — Записи DNS

**Priority P0 · Low.** Correct records + correct proxy mode. Orange cloud = traffic proxied through
Cloudflare (CDN/WAF, origin hidden). Grey cloud = DNS-only (no proxy).

### Records to set (Cloudflare → DNS → Records)

| Type | Name | Content | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `A` | `@` (apex) | `203.0.113.11` | **Proxied** 🟠 | The site. Hides origin, enables CDN/WAF. |
| `CNAME` | `www` | `discammer.com` | **Proxied** 🟠 | Redirect www→apex stays on nginx (or move to CF Redirect Rule, see CF-7 — do **not** duplicate). |
| `TXT` | (SPF/DMARC/verification) | as-is | **DNS-only** ⚪ | TXT is metadata; never proxy. |
| `MX` | (if mail exists) | as-is | **DNS-only** ⚪ | Proxying MX breaks mail. |
| `A`/`CNAME` | ACME / mail hosts (if any) | as-is | **DNS-only** ⚪ | Keep service records grey. |

**Future media subdomain (decision):** today `/media/` lives under the apex, so it is already proxied
and edge-cacheable via CF-5. **If** you later split media onto `media.discammer.com`, add an `A` record
→ origin, **Proxied 🟠**, so the ~15 GB is cached at the edge. No action needed now — just don't
forget the proxy toggle if/when you do it.

### Verify
```bash
curl -sI https://discammer.com | grep -i '^server'   # → cloudflare
dig A discammer.com +short                            # → CF anycast IPs, NOT 203.0.113.11
dig A www.discammer.com +short                        # → CF anycast IPs
dig TXT discammer.com +short                          # → your SPF/DMARC still present
```

**DoD:** `curl -sI` shows `server: cloudflare`; `dig A discammer.com` returns CF anycast IPs (origin
hidden); TXT/MX unchanged and resolving.

---

## CF-3 · SSL/TLS Full (strict) + Origin CA + Authenticated Origin Pulls — Сквозное шифрование

**Priority P0 · Medium.** End-to-end encryption browser→CF→origin with origin cert validation.
Replace Let's Encrypt on the origin with a **Cloudflare Origin CA** cert (15-year, no certbot renewal
behind CF), and require **mTLS** so the origin accepts TLS **only** from Cloudflare.

> **nginx changes are tracked in the repo, not hand-scp'd.** All nginx edits go into
> `deploy/nginx/discammer.conf` (and the new `deploy/nginx/cloudflare-real-ip.conf`), are committed,
> and applied on the server per `deploy/nginx/README.md`. Do **not** edit nginx live and forget to
> commit — the repo is the source of truth (REL-3).

### Steps
1. Cloudflare → **SSL/TLS → Overview** → set encryption mode to **Full (strict)**.
   - ⚠️ Don't pick **Flexible** (HTTP to origin = insecure) or plain **Full** (no cert validation).
2. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** → RSA or ECDSA, hostnames
   `discammer.com` **and** `*.discammer.com`, validity **15 years**. Download `cert.pem` + `key.pem`.
3. On the origin, place them at `/etc/ssl/cloudflare/discammer.pem` and `/etc/ssl/cloudflare/discammer.key`
   (`chmod 600` the key). Update `ssl_certificate` / `ssl_certificate_key` in
   **`deploy/nginx/discammer.conf`** to these paths (replacing the `letsencrypt/live/...` paths).
   **Commit the change.**
4. Enable **Authenticated Origin Pulls**: Cloudflare → **SSL/TLS → Origin Server → Authenticated
   Origin Pulls** (zone-level). Download Cloudflare's origin-pull CA, place it on the origin as
   `/etc/ssl/cloudflare/origin-pull-ca.pem`, and add to the `:443` server block in
   `deploy/nginx/discammer.conf`:
   ```nginx
   ssl_verify_client on;
   ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;
   ```
   This makes the origin accept TLS **only** from Cloudflare (mTLS). **Commit.**
5. Keep port **80** on the origin only for `/.well-known/acme-challenge/` (rollback safety net), or
   disable LE entirely — Origin CA replaces it. Don't decommission certbot until the DoD below is green.
6. Cloudflare → **SSL/TLS → Edge Certificates**: enable **Always Use HTTPS**, **Automatic HTTPS
   Rewrites**, **Minimum TLS Version 1.2**, **TLS 1.3**, **Opportunistic Encryption**.

> **Cross-reference (same effort):** `deploy/nginx/cloudflare-real-ip.conf` (real client IP) and
> `scripts/cf-firewall.sh` (origin lock-down) are being created in this engineering effort and belong
> to **CF-8**. Apply the firewall **last** — see CF-8. The `real-ip` include is needed so mTLS/logs see
> the real visitor IP, but the firewall DROP rules wait until traffic is confirmed on CF.

### Verify
```bash
# Through CF: should be 200 with a valid chain
curl -sI https://discammer.com | head -1

# Direct to origin in spite of CF, presenting the right Host — mTLS must REFUSE it:
curl -sI --resolve discammer.com:443:203.0.113.11 https://discammer.com -H 'Host: discammer.com'
#   → TLS handshake failure / no required SSL certificate was sent  (mTLS working)
```
Run **SSL Labs** (https://www.ssllabs.com/ssltest/analyze.html?d=discammer.com) → target **A / A+**.

**DoD:** `curl -sI https://discammer.com` → 200 with valid chain; a direct origin HTTPS request without
the CF client cert is **refused** (mTLS works); SSL Labs A/A+.

---

## CF-4 · HSTS on edge + preload — HSTS

**Priority P0 · Low.** Move/duplicate HSTS to the edge and prep for CSP (SEC-1). nginx already sends
`Strict-Transport-Security: max-age=63072000; includeSubDomains`. Make the **edge** the source of
truth and reconcile `max-age` so they don't conflict.

### Steps
1. Cloudflare → **SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS)** → **Enable**:
   - **Max-Age:** start at **12 months** (raise to 24 once stable).
   - **Include subdomains:** ON (only if every subdomain is HTTPS — confirm first).
   - **Preload:** ON (only after subdomains confirmed HTTPS).
   - **No-Sniff header:** ON.
2. After 1–2 weeks of stable HSTS, submit the domain at **https://hstspreload.org**.
3. **Reconcile max-age with nginx.** Make the edge the source of truth. In
   `deploy/nginx/discammer.conf` lower or remove the duplicate `add_header Strict-Transport-Security`
   so the two don't disagree (today nginx sends `max-age=63072000` = 24 mo; the edge starts at 12 mo).
   **Commit** the nginx change.

> ⚠️ **Preload is hard to undo.** Once on the preload list, browsers force HTTPS for the domain for a
> long time. Only submit when you're confident the whole domain + subdomains will stay HTTPS.

### Verify
```bash
curl -sI https://discammer.com | grep -i strict-transport-security
# → strict-transport-security: max-age=31536000; includeSubDomains; preload
```

**DoD:** HSTS header present from the edge with the intended `max-age`; nginx duplicate reconciled;
domain submitted to preload (later milestone).

---

## CF-5 · Cache Rules + CDN — Кэширование (главный выигрыш по нагрузке)

**Priority P0 · Medium.** Serve static + the ~15 GB media from the edge; never cache HTML/API. This
removes 80–95% of bandwidth and CPU from the 2-core VPS.

### Cache Rules (Cloudflare → **Caching → Cache Rules**) — order matters, top to bottom

| # | Rule name | Match expression | Cache | Edge TTL | Browser TTL |
| --- | --- | --- | --- | --- | --- |
| 1 | **Static immutable** | `URI Path starts with "/static/js/" or "/static/css/" or "/static/fonts/" or "/static/images/" or "/play/Build/"` OR file extension in `{woff2,js,css,svg,png,webp,wasm}` | Eligible | **1 year** | **Respect origin** (origin already sends `immutable`) |
| 2 | **Media** | `URI Path starts with "/media/"` | Eligible | **30 days** (matches nginx `max-age=2592000`) | **Respect origin** |
| 3 | **No-cache dynamic** | `URI Path starts with "/api/" or "/lang/"` OR `URI Path starts with "/en/" or "/ru/"` OR `URI Path eq "/"` | **Bypass cache** | — | — |

Notes per rule:
- **Rule 1 — Static immutable.** Content is content-hashed (Vite) → safe to cache a year. Browser TTL
  = respect origin (`max-age=31536000, immutable` already set). **Do NOT add `.br` to a compression
  step here** — see the brotli caveat below.
- **Rule 2 — Media.** Large videos. On **Free**, Cloudflare caches objects subject to plan limits;
  very large video files may not stay fully cached. Mitigations: enable **Tiered Cache** (step 5
  below) and/or move media to a `media.` subdomain (CF-2). **Image Resizing / Polish requires Pro** —
  not needed for raw video delivery, only flag it if you later want on-the-fly poster optimization.
- **Rule 3 — No-cache dynamic.** HTML is SSR with `Cache-Control: no-cache`, and the apex `/`
  redirects by the `lang` cookie. **Start with Bypass.** A micro-TTL (30–60 s) on guest HTML is
  *possible* but risky with language cookies — only attempt after analytics show it's worth it, and
  use a cookie-aware bypass. For now: **Bypass.**

### Other caching config
4. **Compression / brotli caveat (CRITICAL for `/play/`).** Cloudflare → **Speed → Optimization →
   Content Optimization**: keep Brotli ON for *text* types. The Unity `.br` assets under `/play/`
   already carry `Content-Encoding: br` set by the app — Cloudflare respects an existing
   `Content-Encoding` and will **not** re-compress. **Do not** add a Compression Rule or any transform
   that would re-encode `/play/*.br`. Double-compression corrupts the game download. Verify after going
   live (see below).
5. Cloudflare → **Caching → Configuration**: **Caching Level: Standard**; **Browser Cache TTL:
   Respect Existing Headers** (origin sends correct headers already).
6. **Tiered Cache:** Cloudflare → **Caching → Tiered Cache → Smart Tiered Caching** → ON. Adds a
   regional tier between edge and origin → fewer origin hits for media.
7. **Purge on deploy (automated, repo side):** `scripts/cf-purge-cache.sh` (created in this same
   engineering effort) is called from `deploy.sh` **after** the post-deploy health probe. It POSTs to
   `POST /zones/{zone}/purge_cache` with prefixes:
   ```json
   {"prefixes":["discammer.com/static/","discammer.com/en/","discammer.com/ru/"]}
   ```
   Hashed chunks change names so they don't need purging; we purge HTML + non-hashed paths.
   **Owner action:** create a **scoped API token** (Zone → Cache Purge: Edit, for this zone only) and
   add two GitHub repo secrets: **`CF_API_TOKEN`** and **`CF_ZONE_ID`** (Zone ID is on the Cloudflare
   zone Overview page, right sidebar).

### Verify
```bash
# 2nd request to a hashed asset should be a HIT
curl -sI "https://discammer.com/static/js/<chunk>.js" | grep -i cf-cache-status   # → HIT
curl -sI "https://discammer.com/media/<video>.mp4"     | grep -i cf-cache-status   # → HIT
curl -sI "https://discammer.com/en/"                   | grep -i cf-cache-status   # → DYNAMIC / BYPASS

# brotli must NOT be double-compressed:
curl -sI "https://discammer.com/play/Build/<asset>.br" | grep -i content-encoding  # → content-encoding: br  (single)
```
On the origin: nginx access logs should show a sharp drop in `/static` and `/media` requests.

**DoD:** static + media return `cf-cache-status: HIT` (after warm-up); HTML/API return `DYNAMIC`/
`BYPASS`; `/play/*.br` keeps a single `content-encoding: br`; origin nginx logs show the drop;
`deploy.sh` purges HTML on deploy.

---

## CF-6 · WAF, rate limiting, bots — Защита периметра

**Priority P0 · Medium.** Managed rules + custom rules + 1 rate-limit rule on the edge. DDoS L3/4 is
on by default (unmetered, even on Free) — here we handle L7.

### Steps
1. **Managed rules** — Cloudflare → **Security → WAF → Managed rules**: enable the **Cloudflare
   Managed Ruleset** (Free gives the basic set; **full OWASP core + advanced managed rulesets require
   Pro**). Action for suspicious = **Managed Challenge**.
2. **Custom rules** — Cloudflare → **Security → WAF → Custom rules**:
   - **Empty / bot-like User-Agent on `/api/*`** → Block.
     `(starts_with(http.request.uri.path, "/api/") and (http.user_agent eq "" or not http.user_agent contains " "))`
   - **`/api/metrics` blocked from the public edge** (it is token-gated/loopback-only and must never
     be reachable from outside) → **Block**:
     `(http.request.uri.path eq "/api/metrics")` → Block.
     ⚠️ This is required. `/api/metrics` must not be served to the public edge.
   - **Bad reputation** → Managed Challenge: `(cf.threat_score gt 30)` → Managed Challenge.
   - *(Optional)* Geo rules later if Web Analytics shows abuse concentrated in a region.
3. **Rate limiting** — Cloudflare → **Security → Rate limiting rules** (Free = **1** rule):
   - Match `/api/*`, threshold **~60 requests / 1 min per IP** → action **Managed Challenge**
     (or Block) for 1 min. Calibrate numbers later from real Web Analytics traffic.
   - **Pro** lets you add more rules (e.g. a separate limit on `/search` and SSR pages).
4. **Bot Fight Mode** — Cloudflare → **Security → Bots** → enable (Free). Knocks out simple bots/
   scrapers.
5. **Security Level:** Medium (default). Document **Under Attack Mode** (Cloudflare → Security →
   Settings) as the manual reaction to an active L7 attack — it shows an interstitial challenge to all
   visitors. Turn it OFF once the attack subsides. (Also note in the ops runbook / REL-2.)
6. **Scrape Shield** — Cloudflare → **Scrape Shield**: enable **Email Obfuscation** and **Hotlink
   Protection** (Hotlink Protection especially for `/media/` so videos can't be embedded from other
   sites and burn your bandwidth).

### Verify
```bash
# Flood test (from a throwaway IP) — should start getting 429/challenge past the limit:
for i in $(seq 1 100); do curl -s -o /dev/null -w "%{http_code}\n" https://discammer.com/api/posts; done | sort | uniq -c

# /api/metrics must be blocked at the edge:
curl -sI https://discammer.com/api/metrics    # → 403 (CF block), NOT 200
```
WAF events appear in **Security → Events**. Run the prod smoke (`scripts/smoke-prod.sh`) to confirm
legitimate traffic isn't challenged.

**DoD:** flood of `/api/posts` past the limit gets 429/challenge; `/api/metrics` returns 403 from the
edge; WAF events visible in Security → Events; legitimate traffic unaffected (smoke passes).

---

## CF-7 · Configuration / Redirect / Transform Rules — Правила

**Priority P1 · Low.** The modern replacement for Page Rules. Centralize redirects and disable
features that break the islands/Unity.

### Steps
1. **Redirect Rule** — `www → apex`. **Only create this if you remove the redirect from nginx**
   (today nginx does `www → apex`). Do **not** duplicate it. If you move it to CF:
   Cloudflare → **Rules → Redirect Rules** → match `http.host eq "www.discammer.com"` →
   **Dynamic redirect** to `concat("https://discammer.com", http.request.uri.path)`, **301**,
   preserve query string. Then delete the `www` 443 server block from `deploy/nginx/discammer.conf`
   and **commit**.
2. **Rocket Loader OFF** — Cloudflare → **Speed → Optimization → Content Optimization** (or a
   Configuration Rule scoped to `/play/*` and the site): **Rocket Loader must be OFF.** It defers/
   reorders JS and **breaks the islands hydration and the Unity WebGL loader**. This is non-negotiable.
3. **Auto Minify OFF** — the JS/CSS bundles are already minified by Vite and content-hashed. Cloudflare
   Auto Minify (where still offered) would alter bytes behind the hash → leave it **OFF**. (Cloudflare
   has been retiring Auto Minify; just ensure nothing minifies the hashed bundles.)
4. **Browser Integrity Check** — leave **ON** for `/api/*` (default). Don't disable it.
5. **Transform Rule (Response Header)** — *reserved* for SEC-1. If you later decide to manage CSP /
   security headers from the edge instead of nginx/FastAPI, add them here as a Response Header
   Transform Rule. No action now.
6. **Always Online** — Cloudflare → **Caching → Configuration → Always Online** → ON. Serves a cached
   copy of pages if the origin is down.

### Verify
```bash
curl -sI https://www.discammer.com/en/ | grep -i location   # → https://discammer.com/en/  (301), if moved to CF
```
Confirm Rocket Loader is off and the site still works: run e2e `bundle.spec.ts` and `scripts/smoke-prod.sh`
against prod — islands + Unity must load with no regressions.

**DoD:** rules active; `www` redirects (from CF only if removed from nginx — no duplication); Rocket
Loader OFF and confirmed by passing `bundle.spec.ts` + smoke; Always Online ON.

---

## CF-8 · Origin lock-down + real IP — Запирание origin (ДЕЛАТЬ ПОСЛЕДНИМ)

**Priority P0 · Medium.** Close the origin to direct access and restore the real client IP in logs/
rate-limits. **This is the LAST step.**

> **This is mostly automated in the repo — but the owner decides WHEN to run it.**
> - `scripts/cf-firewall.sh` (created in this effort): pulls `https://www.cloudflare.com/ips-v4` and
>   `ips-v6`, generates idempotent ufw rules allowing `:443` (and `:80` for ACME if kept) **only** from
>   Cloudflare ranges, DROPs everything else. Intended for a weekly cron (ranges change rarely).
> - `deploy/nginx/cloudflare-real-ip.conf` (created in this effort): `set_real_ip_from <each CF range>;`
>   + `real_ip_header CF-Connecting-IP;`, `include`d in the server block so logs / the beacon
>   rate-limit see the real visitor IP, not a Cloudflare IP. Committed (REL-3).

### When to run — OWNER GATING (read before running `cf-firewall.sh`)
1. **Confirm traffic is actually flowing through Cloudflare first.** Responses show `server: cloudflare`
   and a `cf-ray` header; `dig A discammer.com` returns CF anycast IPs (CF-2 DoD green). Only then run
   the firewall — otherwise you cut off the site.
2. **Keep SSH (`:22`) open from your own IP.** Before running, confirm your admin IP is whitelisted for
   SSH in the firewall. Have VPS-provider console/KVM access available as a fallback.
3. Apply `cloudflare-real-ip.conf` (commit + deploy per `deploy/nginx/README.md`) **before or with**
   the firewall so the real IP is restored at the same time you lock down.

### Run order on the server
```bash
# 0) Backup + confirm your SSH is safe
cp -a /etc/nginx /root/nginx.bak.$(date +%F)
# 1) Real IP (already in deploy/nginx via README apply procedure) — nginx -t && reload
# 2) Lock down (idempotent; whitelists CF ranges; KEEP :22 from your IP)
sudo bash scripts/cf-firewall.sh
# 3) Schedule weekly refresh of CF ranges
#    (cron entry installed by the script or added manually)
```

### Verify
```bash
# Direct origin request (bypassing CF) must FAIL — refused/timeout:
curl -sI --resolve discammer.com:443:203.0.113.11 https://discammer.com -H 'Host: discammer.com'
#   → connection refused / timeout (firewall) and/or TLS refusal (mTLS from CF-3)

# On the origin, tail nginx logs while you browse the live site — you should see the REAL visitor IP,
# not a Cloudflare IP:
sudo tail -f /var/log/nginx/access.log
```
Confirm the app (`request_logging_middleware`, the `/api/client-errors` beacon rate-limit) reads the
restored IP.

**DoD:** direct `curl` to `203.0.113.11` (bypassing CF) is refused/timed out; nginx logs show the real
visitor IP (not a CF IP); the beacon rate-limit triggers on the real IP; SSH still works from your IP.

---

## CF-9 · Web Analytics (cookieless) — Аналитика без трекинга

**Priority P1 · Low.** Cloudflare Web Analytics: no cookies, no user tracking — fits the privacy brand.
**No Google Analytics.**

### Steps
1. Cloudflare → **Analytics & Logs → Web Analytics** → enable for the zone. On a proxied domain it
   works **server-side without a JS beacon**. Optionally add the lightweight (cookieless) beacon for
   real-user Core Web Vitals.
2. **If** you add the JS beacon → it loads from `static.cloudflareinsights.com`. Account for it in CSP
   (SEC-1): allow `static.cloudflareinsights.com` in `script-src` and `connect-src`. Without the
   beacon (server-side only), no CSP change is needed.
   - ⚠️ The beacon makes a network request. The privacy promise + e2e `assertNoNetworkLeak` is about
     the **client-side message checker** (nothing the user types leaves the device). The cookieless
     analytics beacon is acceptable and does not transmit checker input — but if `assertNoNetworkLeak`
     is scoped broadly, confirm it still passes, or prefer the **server-side (beacon-less)** mode.
3. Set up the dashboard: traffic by country, top paths, status codes, Core Web Vitals (LCP/CLS/INP).

### Verify
- Data appears in the Web Analytics dashboard within a few minutes of live traffic.
- Browser DevTools → **Application → Cookies** on `discammer.com`: only the `lang` cookie — **no**
  analytics/tracking cookies.

**DoD:** data flowing into the CF dashboard; no new cookies in the browser (only `lang`); if the JS
beacon is used, CSP updated and `assertNoNetworkLeak` still green (or server-side mode chosen).

### AN-1 · Privacy-first product analytics — two halves

`FEATURE_PLAN.md` AN-1 sits **on top of** CF-9 and has two halves:

- **(a) Server-side surface counter — `discammer_surface_views_total` — implemented (repo change).**
  A PII-free, RED-adjacent Prometheus counter in `backend/metrics.py`, fed once per request from the
  existing request middleware in `backend/main.py`. It records **which server-rendered surface** a
  reader loaded (`home` / `journal` / `post` / `guide` / `course` / `module` / `lesson` / `game` /
  `about` / `portfolio` / `tools_check` / `tools_inspect` / `search`), labelled only by the coarse
  **surface name** and the **UI language** (`en`/`ru`). It never carries a slug, path, query string,
  request body, IP, or any user content — the checker/inspector are counted by surface **name** only,
  and their pasted text runs entirely in the browser and never reaches the server. Cardinality stays
  tiny (~13 surfaces × 2 langs). It is exposed via the already token-gated / loopback-only
  `/api/metrics` (see CF-6 — that endpoint MUST stay blocked at the public edge). **Not**
  production-verified: only a dated external check of live scrapes could claim that.
- **(b) Cloudflare Web Analytics (cookieless, edge) — owner configuration step (CF-9 above).** The
  traffic/pages/Web-Vitals half is enabled by the **owner** in the Cloudflare dashboard per CF-9;
  it is a dashboard action, not a repo change.

---

## Status checklist — Чек-лист

| ID | Section | Status |
| --- | --- | --- |
| CF-1 | Add site + nameservers + DNSSEC | ☐ |
| CF-2 | DNS records (apex/www proxied, TXT/MX grey) | ☐ |
| CF-3 | SSL/TLS Full (strict) + Origin CA + mTLS | ☐ |
| CF-4 | HSTS on edge + preload (later) | ☐ |
| CF-5 | Cache Rules + Tiered Cache + deploy purge | ☐ |
| CF-6 | WAF + rate limit + bots + metrics block | ☐ |
| CF-7 | Redirect/Config/Transform rules (Rocket Loader OFF) | ☐ |
| CF-8 | Origin lock-down + real IP (**LAST**) | ☐ |
| CF-9 | Web Analytics (cookieless) | ☐ |

### Cross-referenced repo artifacts (created in this engineering effort)
- `scripts/cf-firewall.sh` — origin firewall (CF-8), run **last**, keep SSH open.
- `deploy/nginx/cloudflare-real-ip.conf` — restore real client IP (CF-8), `include`d in the server block.
- `scripts/cf-purge-cache.sh` — called from `deploy.sh` after the health probe (CF-5); needs
  `CF_API_TOKEN` + `CF_ZONE_ID` GitHub secrets.
- `deploy/nginx/discammer.conf` + `deploy/nginx/README.md` — nginx is version-controlled and applied
  per the README; do **not** hand-scp config.
