"""PERF-3 — the service worker is served from ROOT scope with anti-stale headers.

The worker file (`backend/static/sw.js`) is emitted by `npm run build`
(frontend/vite-plugin-sw.ts). The route (`GET /sw.js`, in routers/seo.py) must
serve it from the origin root so it can control navigations site-wide, as
`text/javascript`, and with `Cache-Control: no-cache` so browsers always
re-fetch it and pick up a new deploy's worker (the same anti-stale reasoning
that keeps HTML on `no-cache`). If the frontend hasn't been built the tests that
need the file skip, matching test_assets.py.
"""
from __future__ import annotations

import pytest

from config import STATIC_DIR

_SW_PATH = STATIC_DIR / "sw.js"


def _require_built() -> None:
    if not _SW_PATH.exists():
        pytest.skip(f"Service worker missing at {_SW_PATH}; run `npm run build`")


def test_sw_served_from_root_scope(client):
    """The worker is reachable at the origin root (not under /static/), which is
    what lets it claim the default `/` scope for site-wide navigation control."""
    _require_built()
    r = client.get("/sw.js")
    assert r.status_code == 200


def test_sw_content_type_is_javascript(client):
    _require_built()
    r = client.get("/sw.js")
    assert r.headers["content-type"].startswith("text/javascript")


def test_sw_is_always_revalidated(client):
    """Cache-Control must force revalidation so a new worker is never pinned."""
    _require_built()
    r = client.get("/sw.js")
    cache_control = r.headers.get("cache-control", "").lower()
    assert "no-cache" in cache_control or "max-age=0" in cache_control, cache_control


def test_sw_is_not_cacheable_by_the_cdn(client):
    """State the always-revalidate intent to the CDN, not just to the browser.

    Production serves `/sw.js` as `cache-control: max-age=14400` even though the
    origin sets `no-cache` (observed 2026-08-01). A cache-busted request returns
    `cf-cache-status: MISS` and STILL carries `max-age=14400`, so this is not an
    edge-staleness artifact: the Cloudflare zone is applying its Free-plan
    default Browser Cache TTL instead of the "Respect Existing Headers" setting
    that `docs/cloudflare/SETUP.md` mandates (its checklist row is unchecked).
    The same rewrite hits the whole non-hashed-static bucket — fonts, favicon,
    logomark, the OG image — so the zone setting, not this route, is the real
    remedy.

    Scope discipline: the worker itself is NOT known to go stale. The Service
    Worker spec forces `cache: no-cache` on the top-level script request for
    both registration and every update check, `sw-register.ts` leaves
    `updateViaCache` at its default, the worker calls no `importScripts()`, and
    the precache already bypasses the HTTP cache via
    `new Request(url, {cache: 'reload'})`. So this asserts DEFENCE IN DEPTH and
    makes the origin's intent legible to any CDN — it is not the fix for an
    observed stale-worker incident, and must not be described as one.

    `no-cache`, not `no-store`, and that distinction is load-bearing:
    `sw-register.ts` runs on every page load and the spec makes that request
    bypass the browser cache, so the checks land on the edge. `no-store` would
    turn the edge into a pass-through and move one origin request per page view
    onto a 2 vCPU box. `no-cache` lets the edge hold the bytes while forbidding
    it to serve them unrevalidated.

    `Cloudflare-CDN-Cache-Control` (CF-specific, highest precedence) and
    `CDN-Cache-Control` (RFC 9213) are consumed by the edge and stripped before
    the response reaches the browser, so neither weakens the `no-cache` above.
    """
    _require_built()
    r = client.get("/sw.js")
    assert r.headers.get("cloudflare-cdn-cache-control", "").lower() == "no-cache"
    assert r.headers.get("cdn-cache-control", "").lower() == "no-cache"


def test_sw_declares_root_scope_header(client):
    """Service-Worker-Allowed: / is set explicitly (belt-and-braces for root scope)."""
    _require_built()
    r = client.get("/sw.js")
    assert r.headers.get("service-worker-allowed") == "/"


def test_sw_body_is_fully_substituted(client):
    """The emitted worker must have its build-time placeholders replaced, carry a
    versioned cache name, and use the lifecycle hooks (skipWaiting/clients.claim)."""
    _require_built()
    r = client.get("/sw.js")
    body = r.text
    # No unreplaced template tokens leaked into the shipped worker.
    assert "__SW_VERSION__" not in body
    assert "__PRECACHE_URLS__" not in body
    assert "__OFFLINE_URL__" not in body
    # Versioned cache names + prompt-takeover lifecycle are present.
    assert "discammer-precache-" in body
    assert "skipWaiting" in body
    assert "clients.claim" in body


def test_sw_does_not_get_a_csp_header(client):
    """The worker is a script response, not an HTML document, so the document-only
    security/CSP headers (which carry a per-request nonce) must not be attached."""
    _require_built()
    r = client.get("/sw.js")
    assert "content-security-policy" not in {k.lower() for k in r.headers}
    assert "content-security-policy-report-only" not in {k.lower() for k in r.headers}


def test_manifest_still_served(client):
    """Sanity: the PWA manifest the worker complements is still reachable."""
    r = client.get("/manifest.webmanifest")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/manifest+json")
