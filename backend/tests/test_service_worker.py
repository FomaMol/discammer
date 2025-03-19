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
