"""SEC-1 security headers / CSP + SEC-2 API rate limiting.

- HTML documents carry a Content-Security-Policy(-Report-Only) header whose
  per-request nonce matches the nonce rendered into the page's inline <script>
  tags, plus the standard hardening headers (X-Frame-Options, Referrer-Policy,
  Permissions-Policy, COOP, X-Content-Type-Options).
- JSON/API responses do NOT carry the document-level CSP/X-Frame-Options.
- The general /api/* limiter returns 429 over the per-IP ceiling, while
  /api/health (monitoring) is exempt.
- The /api/csp-report sink stores nothing, caps the body, and logs only the
  coarse violation shape.
"""
from __future__ import annotations

import logging
import re

import pytest

from ratelimit import RateLimiter


def test_html_has_csp_report_only_with_matching_nonce(client):
    r = client.get("/en/")
    assert r.status_code == 200

    # Default config ships Report-Only.
    csp = r.headers.get("content-security-policy-report-only")
    assert csp, "HTML must carry a CSP (Report-Only by default)"
    assert "default-src 'self'" in csp
    assert "object-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    # frame-src derives from the markdown iframe allowlist.
    assert "https://player.vimeo.com" in csp
    assert "https://*.youtube.com" in csp or "https://youtube.com" in csp
    # script-src is nonce-gated, never 'unsafe-inline'.
    m = re.search(r"script-src [^;]*'nonce-([A-Za-z0-9_\-]+)'", csp)
    assert m, "script-src must contain a per-request nonce"
    assert "'unsafe-inline'" not in re.search(r"script-src[^;]*", csp).group(0)

    nonce = m.group(1)
    # The same nonce must be on the page's inline <script> tags.
    assert f'nonce="{nonce}"' in r.text, "inline scripts must carry the CSP nonce"


def test_html_has_hardening_headers(client):
    r = client.get("/en/")
    assert r.headers.get("x-frame-options") == "DENY"
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert r.headers.get("cross-origin-opener-policy") == "same-origin"
    pp = r.headers.get("permissions-policy", "")
    assert "geolocation=()" in pp and "interest-cohort=()" in pp


def test_nonce_is_per_request(client):
    a = client.get("/en/")
    b = client.get("/en/")
    na = re.search(r"'nonce-([A-Za-z0-9_\-]+)'", a.headers["content-security-policy-report-only"]).group(1)
    nb = re.search(r"'nonce-([A-Za-z0-9_\-]+)'", b.headers["content-security-policy-report-only"]).group(1)
    assert na != nb, "each request must get a fresh nonce"


def test_json_api_has_no_document_csp(client):
    r = client.get("/api/posts")
    assert r.status_code == 200
    assert "content-security-policy" not in {k.lower() for k in r.headers}
    assert "content-security-policy-report-only" not in {k.lower() for k in r.headers}
    assert "x-frame-options" not in {k.lower() for k in r.headers}


def test_api_rate_limit_returns_429_over_ceiling(client):
    """The general /api/* limiter rejects over the per-IP ceiling. Swap in a
    tiny limiter so the test doesn't have to send hundreds of requests."""
    import main

    original = main._api_limiter
    main._api_limiter = RateLimiter(3)
    try:
        statuses = [
            client.get("/api/posts", headers={"X-Real-IP": "9.9.9.9"}).status_code
            for _ in range(6)
        ]
    finally:
        main._api_limiter = original
    assert 200 in statuses, "requests under the ceiling must pass"
    assert 429 in statuses, "requests over the per-IP ceiling must be 429"


def test_health_is_exempt_from_api_rate_limit(client):
    """Monitoring must never be throttled — /api/health stays 200 even with a
    near-zero limiter installed."""
    import main

    original = main._api_limiter
    main._api_limiter = RateLimiter(1)
    try:
        statuses = [client.get("/api/health").status_code for _ in range(5)]
    finally:
        main._api_limiter = original
    assert all(s == 200 for s in statuses), "/api/health must be exempt from rate limiting"


def test_csp_report_endpoint_logs_coarse_shape(client, caplog):
    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    try:
        r = client.post(
            "/api/csp-report",
            json={
                "csp-report": {
                    "effective-directive": "script-src",
                    "blocked-uri": "https://evil.example.com/steal.js?token=SECRETVALUE",
                    "document-uri": "https://discammer.com/en/",
                }
            },
            headers={"X-Request-ID": "csp-1"},
        )
    finally:
        discammer_logger.removeHandler(caplog.handler)

    assert r.status_code == 204
    recs = [rec for rec in caplog.records if getattr(rec, "rid", None) == "csp-1"]
    assert recs, "a CSP report should produce one coarse log line"
    rec = recs[0]
    assert getattr(rec, "csp_directive", None) == "script-src"
    # Only scheme+host is kept — never the path/query.
    assert getattr(rec, "csp_blocked", None) == "https://evil.example.com"
    for attr in vars(rec).values():
        assert "SECRETVALUE" not in str(attr), "report path/query must not be logged"


def test_csp_report_oversized_body_413(client):
    big = "x" * 9000
    r = client.post(
        "/api/csp-report",
        content=('{"csp-report":{"blocked-uri":"%s"}}' % big).encode(),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413
