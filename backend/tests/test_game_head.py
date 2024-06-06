"""HEAD support for the /play/ game routes.

Uptime monitors and link checkers hit endpoints with HEAD. The /play/ index
and asset catch-all are registered for GET+HEAD; Starlette's FileResponse emits
an empty body for HEAD once the route accepts it, so HEAD must return the same
status + headers as GET but with no body.
"""
from __future__ import annotations


def test_head_play_index(client):
    # The game build is installed in this repo (backend/game_build/index.html
    # exists), so /play/ returns 200. Stay defensive if a build is absent.
    r = client.head("/play/")
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        # Empty body for HEAD, and the same no-cache policy as GET index.
        assert r.content == b""
        assert r.headers.get("cache-control") == "no-cache"


def test_head_play_index_matches_get_headers(client):
    head = client.head("/play/")
    get = client.get("/play/")
    assert head.status_code == get.status_code
    if head.status_code == 200:
        assert head.headers.get("cache-control") == get.headers.get("cache-control")
        assert head.content == b""


def test_head_play_asset(client):
    # A real version-stamped immutable asset shipped in the build.
    r = client.head("/play/Build/web_gl_build_10.loader.js")
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.content == b""
        assert r.headers.get("cache-control") == "public, max-age=31536000, immutable"
