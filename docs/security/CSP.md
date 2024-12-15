# Content-Security-Policy & security headers (SEC-1)

The FastAPI app is the single source of truth for document security headers
(`backend/security.py`, applied by the request middleware in `backend/main.py`).
The nginx vhost only keeps **HSTS** (a TLS-edge concern); it no longer sets
`X-Content-Type-Options` / `Referrer-Policy` to avoid duplicate headers.

## What is set

On every `text/html` response (except `/play/` — see below):

| Header | Value |
|---|---|
| `Content-Security-Policy-Report-Only` *(default)* / `Content-Security-Policy` | see policy below |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=(), payment=(), usb=()` |

### The policy

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-<per-request>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
media-src 'self' blob:;
connect-src 'self';
frame-src <markdown iframe allowlist>;
worker-src 'self';
manifest-src 'self';
report-uri /api/csp-report;
```

- **`script-src` is nonce-based** — no `'unsafe-inline'`. A per-request nonce is
  generated in the middleware (`request.state.csp_nonce`) and rendered onto every
  inline `<script>` (the island i18n bootstrap, the guide ToC builder, and all
  JSON-LD blocks).
- **`frame-src`** is generated from `markdown_renderer._ALLOWED_IFRAME_HOSTS`
  (kinescope / wistia / youtube / youtube-nocookie / vimeo / drive / docs) so the
  embed policy and the markdown sanitizer never drift.
- **`connect-src 'self'`** — the privacy promise holds: the only fetch is the
  same-origin client-error beacon. To enable the Cloudflare Web Analytics beacon
  (CF-9) add `CSP_CONNECT_EXTRA="https://static.cloudflareinsights.com"`.

### Config (env)

| Var | Default | Meaning |
|---|---|---|
| `CSP_ENABLED` | `1` | master switch |
| `CSP_REPORT_ONLY` | `1` | Report-Only vs enforce |
| `CSP_REPORT_URI` | `/api/csp-report` | violation sink (empty disables) |
| `CSP_CONNECT_EXTRA` | `` | extra `connect-src` hosts (space-sep) |

## The violation sink — `/api/csp-report`

Same privacy posture as the client-error beacon: stores **nothing**, caps the
body (8 KB → 413), is per-IP rate-limited (`CSP_REPORT_RATE_LIMIT`, 429 with no
log line), and logs only the **coarse shape** — the violated directive and the
`scheme://host` of the blocked URI (never the path/query).

## Report-Only → enforce path

Ship in Report-Only (the default), bake for ~1 week, watch the `csp violation`
log lines, then flip `CSP_REPORT_ONLY=0`.

**Before enforcing, close these known gaps** (they will appear in Report-Only):

1. **Inline `onmouseover`/`onmouseout` handlers in `templates/home.html`**
   (~10, decorative hover styling). With `script-src` nonce-only these are
   reported and will be *blocked when enforced*. Convert them to CSS `:hover`
   (Tailwind `hover:` utilities or a small rule) and rebuild the frontend. Until
   then, enforcing would disable those hover effects (cosmetic only).
2. **`style-src 'unsafe-inline'`** remains because the design uses many
   `style="…"` attributes plus the inline `@font-face` block; inline style
   *attributes* can't be nonce'd. Hardening (utility-only styling / hashed style
   block) is future work — not a blocker for enforcing `script-src`.

## `/play/` (Unity WebGL) is excluded from CSP

The game's static, engine-generated `index.html` carries inline loader scripts
that can't be nonce'd and needs WASM eval. It still gets the static hardening
headers (X-Frame-Options etc.) but **not** the nonce CSP — giving it the
nonce-only policy would break the loader once enforced. The bundle is otherwise
self-contained (served from `/play/`).

## Verification

- `pytest backend/tests/test_security_headers.py`
- After deploy: `curl -sI https://discammer.com/en/ | grep -i -E 'content-security|x-frame|referrer|permissions'`
- [securityheaders.com](https://securityheaders.com) target A/A+ (full A+ after enforce).
