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

**Status: the flip has not been performed.** It is an owner action against a
deployed environment, and no dated external check of an enforcing header exists
yet. The flip itself is a pure env change — no code edit — which
`test_csp_enforce_mode_flips_to_enforcing_header`
(`backend/tests/test_security_headers.py`, commit `42128ce`) locks in by
asserting `CSP_REPORT_ONLY=0` emits the enforcing `Content-Security-Policy`
header with the same policy body. That test is a repo check, not evidence that
enforce mode is live.

**Known gaps** (they appear in Report-Only):

1. ~~**Inline `onmouseover`/`onmouseout` handlers in `templates/home.html`**~~ —
   **closed** by commit `3993871` (2026-07-14). All 22 handler attributes on 11
   elements (`home.html`: 10 elements × `onmouseover`+`onmouseout` = 20;
   `post.html`: 1 element × 2) were converted to `.dcm-*` CSS
   `:hover` rules (`frontend/src/styles/globals.css:542-562`, reduced-motion
   variants at `603-606`) and the frontend was rebuilt. `grep -rn
   "onmouseover\|onmouseout" backend/templates/` now returns zero matches, so
   nonce-only `script-src` no longer costs those hover effects when enforced.
   This gap is **not** a blocker for the flip.
2. **`style-src 'unsafe-inline'`** — **still open.** It remains because the
   design uses many `style="…"` attributes plus the inline `@font-face` block;
   inline style *attributes* can't be nonce'd. Hardening (utility-only styling
   / hashed style block) is future work — not a blocker for enforcing
   `script-src`.

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
