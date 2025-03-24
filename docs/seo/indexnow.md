# SEO-3 — Search Console, Webmaster verification & IndexNow

**Status: configured.** The repo ships the IndexNow key-file route, the ping
script, and the deploy hook. Search-engine verification and turning IndexNow on
are **owner dashboard/DNS steps** — nothing here is "production verified" until
the owner completes them and a dated external check confirms it.

Two independent things live under SEO-3:

1. **Webmaster verification** (Google Search Console, Bing Webmaster, Yandex
   Webmaster) — proves you own the domain so you can see coverage/indexing.
   Owner step, done once, via Cloudflare DNS-TXT.
2. **IndexNow** — pushes changed URLs to Bing/Yandex the instant you deploy, so
   they re-crawl fresh content without waiting for a scheduled crawl. This is
   wired in code and gated on one env var.

> Terminology (PROJECT.md): **implemented** = source/repo checks exist;
> **configured** = config/runbook exists; **production verified** = a dated
> external check. Everything below is *implemented* (route + script + hook,
> covered by `backend/tests/test_indexnow.py`) or *configured* (this runbook).
> The live verification is the owner's to perform.

---

## Part 1 — Webmaster verification (owner, one-time)

Because DNS is already on Cloudflare (CF-1), every engine can be verified with a
single **DNS-TXT** record — no HTML file, no meta tag, and it survives redeploys.

### Google Search Console

1. <https://search.google.com/search-console> → **Add property** → **Domain** →
   `discammer.com`.
2. Google shows a `TXT` record like `google-site-verification=<token>`.
3. Cloudflare → **DNS → Records** → **Add record**: `TXT`, name `@`
   (or `discammer.com`), content = the full `google-site-verification=...` value.
   Leave it **DNS-only (grey cloud)** — TXT records aren't proxied anyway.
4. Back in GSC → **Verify**.
5. GSC → **Sitemaps** → submit `https://discammer.com/sitemap.xml`.
6. GSC → **Settings → International Targeting** → confirm the `hreflang`
   (`en` / `ru` / `x-default`) reported for the site is clean (SEO-1 emits it in
   `base.html` and in the sitemap `xhtml:link`s).

### Bing Webmaster Tools

1. <https://www.bing.com/webmasters> → **Add site** → `https://discammer.com`.
   (Tip: Bing can **import from GSC**, which carries the verification across.)
2. If verifying directly: add the `TXT` record Bing gives you in Cloudflare DNS,
   same as above.
3. Submit `https://discammer.com/sitemap.xml`.

### Yandex Webmaster (important for the RU audience)

1. <https://webmaster.yandex.com> → **Add site** → `https://discammer.com`.
2. Choose **DNS record** verification → add Yandex's `TXT` in Cloudflare DNS.
3. Submit `https://discammer.com/sitemap.xml`.

**DoD (owner):** domain shows *Verified* in GSC, Bing, and Yandex; the sitemap
is *Success* in each; GSC International Targeting shows no `hreflang` errors.

---

## Part 2 — IndexNow (implemented in repo + owner enables)

### What ships in the repo

| Piece | Where | Behaviour |
| --- | --- | --- |
| Key-file route | `backend/routers/seo.py` → `GET /<key>.txt` | 404 when `INDEXNOW_KEY` is unset/malformed; otherwise serves the key as `text/plain`. Doesn't shadow `/robots.txt`. Tested in `backend/tests/test_indexnow.py`. |
| Ping script | `scripts/indexnow-ping.sh` | Best-effort POST to the IndexNow API. Skips cleanly (exit 0) when `INDEXNOW_KEY` is unset. |
| Deploy hook | `scripts/deploy.sh` → `ping_indexnow()` | Runs after a healthy deploy, next to `purge_edge_cache`; non-fatal, gated on the same env. |
| Config | `backend/config.py` → `INDEXNOW_KEY` | Empty by default (feature off). |

### How ownership works

IndexNow (Bing, Yandex, Seznam, Naver, …; **not** Google) accepts a URL
submission only when the submitting host proves it controls the key by serving a
file named `<key>.txt` at the site root whose body is the key. The FastAPI route
serves exactly that, gated on `INDEXNOW_KEY`, so the file and the ping are always
consistent — set the key and both light up; leave it unset and both stay dark.

### Enabling it (owner)

You can either let the origin host the key (self-contained, **default**) **or**
use Cloudflare's built-in IndexNow — do **not** do both.

**Option A — origin-hosted key (recommended, self-contained):**

1. Generate a key: 8–128 chars from `[a-zA-Z0-9-]`, e.g.
   `openssl rand -hex 16` (32 hex chars).
2. Add it to the prod environment as `INDEXNOW_KEY=<key>` (same mechanism as the
   other deploy secrets — see `docs/ops/secrets.md`). The container reads it at
   start; `docker-compose.prod.yml` passes host env through.
3. Redeploy. Verify the key file: `curl https://discammer.com/<key>.txt` returns
   the key with `content-type: text/plain`.
4. On the next content deploy, `deploy.sh` runs `ping_indexnow()` automatically.
   Manual trigger:
   `INDEXNOW_KEY=<key> scripts/indexnow-ping.sh`

   By default the script derives the URL list from the live
   `https://discammer.com/sitemap.xml` (capped at `INDEXNOW_MAX_URLS`, default
   1000). Submit a specific set instead with
   `INDEXNOW_URLS="https://discammer.com/en/guide/phishing https://discammer.com/ru/guide/phishing"`.

**Option B — Cloudflare built-in IndexNow (dashboard, no origin file):**

- Cloudflare → **Caching → Configuration → IndexNow** → enable. Cloudflare then
  hosts the key and pings on cache changes. If you choose this, leave
  `INDEXNOW_KEY` unset so the origin route stays closed and the deploy hook
  skips — you don't want two submitters fighting over the same host.

### Caveats

- **Google ignores IndexNow.** Google indexing still relies on the sitemap +
  GSC (Part 1). IndexNow only accelerates Bing/Yandex/etc.
- The IndexNow API returns `200`/`202` on success. `403` means the key file
  isn't reachable/verified yet, `422` means a submitted URL's host doesn't match
  the key's host. The script treats non-2xx as a **soft** failure (logs, exits 0)
  so it never breaks a deploy.
- Keep submissions to genuinely changed URLs where practical; the sitemap-wide
  default is fine for our size but don't loop it needlessly.

**DoD (owner):** `curl https://discammer.com/<key>.txt` returns the key; a manual
`scripts/indexnow-ping.sh` logs an accepted (`200`/`202`) submission; Bing/Yandex
Webmaster show IndexNow submissions arriving. Until then this is **configured**,
not production-verified.
