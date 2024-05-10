# DiScammer nginx vhost

The production nginx vhost for `discammer.com` previously existed **only on the
server**. A server rebuild lost it. `discammer.conf` in this directory is a
best-known reconstruction so the config is version-controlled.

## What this config does

nginx runs on the host and terminates TLS. It then:

- **`:80`** — serves the certbot ACME challenge from a webroot, and 301-redirects
  everything else to `https://`.
- **`:443` (`www`)** — 301-redirects `www.discammer.com` to the apex.
- **`:443` (apex)** — the real site:
  - **`/media/`** — large videos/posters (~15 GB) served **directly by nginx**
    from `/opt/discammer/media/` on the host, with a long immutable cache and
    `autoindex off`. The app never serves these; local `/media/*` 404s in dev
    are expected.
  - **everything else** — reverse-proxied to the app at `127.0.0.1:8000`
    (uvicorn in Docker, published to loopback by `docker-compose.prod.yml`).
    This includes the SSR HTML, the JSON API, `/static/*` (the app handles
    those with `?v=mtime` cache-busting), and `/play/*` (the brotli-precompressed
    Unity game — the app sets `Content-Encoding: br`; nginx passes it through
    unchanged, so do **not** add a special location for it).
  - Standard proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`,
    `X-Forwarded-Proto $scheme`). Keep `X-Forwarded-Proto $scheme` — uvicorn
    only trusts `X-Forwarded-*` from loopback and uses it to keep redirects on
    `https`.
  - HSTS, `gzip` for text/HTML/JS/CSS/JSON/XML/SVG, and a modest
    `client_max_body_size`.

## This round does NOT auto-sync nginx

Applying this config is a **manual owner step**. `deploy.sh` is unchanged and
does **not** touch nginx — it only rebuilds and restarts the Docker app. Nothing
in CI/CD reads this directory.

## Apply procedure (manual, on the server)

> **Reconcile first.** This file is a reconstruction. Before you apply it, diff
> it against the live config and resolve **every line tagged `# RECONCILE:`**
> (see the full list below). The reconstructed values are sane defaults, not
> verified facts.

1. **Diff against the live config** (if one still exists):

   ```bash
   # Wherever the live vhost currently lives, e.g.:
   sudo diff -u /etc/nginx/sites-enabled/discammer.conf \
               /opt/discammer/deploy/nginx/discammer.conf
   ```

   Walk every `# RECONCILE:` line and make the repo file match reality (cert
   paths, webroot, media root, header policy, timeouts, etc.).

2. **Place the file.** Pick the convention your server already uses — do not
   mix both.

   **sites-available + symlink:**
   ```bash
   sudo cp /opt/discammer/deploy/nginx/discammer.conf \
           /etc/nginx/sites-available/discammer.conf
   sudo ln -sf /etc/nginx/sites-available/discammer.conf \
               /etc/nginx/sites-enabled/discammer.conf
   ```

   **or conf.d:**
   ```bash
   sudo cp /opt/discammer/deploy/nginx/discammer.conf \
           /etc/nginx/conf.d/discammer.conf
   ```

3. **Test the config:**
   ```bash
   sudo nginx -t
   ```
   This must print `syntax is ok` / `test is successful`. If it fails on a
   `ssl_certificate` / `options-ssl-nginx.conf` / `ssl-dhparams.pem` path, the
   cert hasn't been issued yet (or the path differs) — fix the path or run
   certbot first.

4. **Reload (zero-downtime):**
   ```bash
   sudo systemctl reload nginx
   ```
   Use `reload`, not `restart`, so in-flight connections aren't dropped.

5. **Smoke-check** from off-box:
   ```bash
   curl -sI https://discammer.com/en/                    # 200, expect HSTS header
   curl -sI http://discammer.com/en/                     # 301 -> https
   curl -sI https://www.discammer.com/                   # 301 -> apex
   curl -sI https://discammer.com/media/<known-file>     # 200, immutable cache
   curl -sI https://discammer.com/play/                  # 200 (proxied app)
   curl -sH 'Accept-Encoding: br' -I https://discammer.com/play/Build/<x>.br   # Content-Encoding: br intact
   ```

## TLS / certbot first-issue (only if no cert exists yet)

The `:443` blocks reference `/etc/letsencrypt/live/discammer.com/`. If that
directory does not exist yet, obtain the cert before enabling the HTTPS server
blocks (e.g. with the certbot nginx plugin, or webroot mode pointed at the
`/.well-known/acme-challenge/` root in the `:80` block). Certbot writes
`options-ssl-nginx.conf` and `ssl-dhparams.pem`; the config `include`s them as
certbot expects.

## `# RECONCILE:` checklist — verify every item against the live server

These are inferred, not confirmed. Check each before reload:

- **`server 127.0.0.1:8000`** — app upstream address (loopback publish).
- **`upstream` keepalive + `proxy_http_version 1.1` + `Connection ""`** — kept
  for connection reuse; drop together if the live config doesn't use an
  upstream block.
- **IPv6 `listen [::]:80` / `[::]:443`** — confirm the host actually serves
  IPv6.
- **`http2 on;`** — confirm HTTP/2 is enabled on the live server.
- **`/.well-known/acme-challenge/` `root /var/www/certbot`** — the real certbot
  webroot path.
- **`ssl_certificate` / `ssl_certificate_key`** — exact certbot live paths.
- **`include /etc/letsencrypt/options-ssl-nginx.conf;`** — present/named as
  written by your certbot.
- **`ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;`** — present/named as
  written by your certbot.
- **HSTS `max-age` + `includeSubDomains`** — confirm the policy; do **not** add
  `preload` unless every subdomain is HTTPS-only and you intend to submit it.
- **`X-Content-Type-Options` / `Referrer-Policy`** — confirm whether the live
  server already sets these (avoid double headers).
- **`client_max_body_size 16m`** — confirm the cap matches any real upload path.
- **`/media/` `alias /opt/discammer/media/`** — confirm the host media root.
- **`/media/` cache policy** (`Cache-Control` / `expires` 30d immutable,
  `access_log off`) — confirm the desired window and logging.
- **`X-Forwarded-Host`** — confirm whether the live server sets it.
- **`proxy_read_timeout` / `proxy_connect_timeout`** — confirm they match live.

> No local `nginx` binary was available when this was authored, so syntax was
> not machine-validated here. `sudo nginx -t` on the server in step 3 is the
> authoritative check.
