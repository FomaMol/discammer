"""Same-origin framing of the Unity game (regression, prod screenshot 2026-07-14).

/{lang}/game opens the game in an <iframe src="/play/"> (GameLauncher island).
SEC-1 introduced X-Frame-Options: DENY on every HTML document — including
/play/ — so the browser refuses to render the iframe and Chrome shows
"discammer.com refused to connect" inside the dialog.

Contract:
- /play/ (and only /play/) answers X-Frame-Options: SAMEORIGIN so the
  same-origin game page may frame it; other documents keep DENY.
- The pages' CSP frame-src must include 'self', otherwise flipping
  CSP_REPORT_ONLY=0 would re-break the iframe from the parent side.
"""
from __future__ import annotations

import re


def test_play_index_allows_same_origin_framing(client):
    r = client.get("/play/")
    assert r.status_code == 200, "game build is committed in this repo"
    assert r.headers.get("x-frame-options") == "SAMEORIGIN"


def test_play_redirect_carries_no_deny(client):
    # Pins current behavior: the /play -> /play/ redirect is not an HTML
    # document, so the middleware attaches no X-Frame-Options at all. If that
    # ever changes, it must not change to DENY.
    r = client.get("/play", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers.get("x-frame-options") in (None, "SAMEORIGIN")


def test_regular_pages_keep_deny(client):
    r = client.get("/en/game")
    assert r.status_code == 200
    assert r.headers.get("x-frame-options") == "DENY"


def test_csp_frame_src_includes_self(client):
    csp = client.get("/en/game").headers.get(
        "content-security-policy-report-only", ""
    )
    m = re.search(r"frame-src ([^;]*)", csp)
    assert m, "pages must carry a frame-src directive"
    assert "'self'" in m.group(1), (
        "frame-src must allow 'self' or enforcing CSP re-breaks the /play/ iframe"
    )
