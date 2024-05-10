"""Smoke tests — every public surface should at least respond."""
from __future__ import annotations

from markupsafe import escape


def test_home_renders(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "DiScammer" in r.text


def test_journal_renders(client):
    r = client.get("/journal")
    assert r.status_code == 200


def test_course_renders(client):
    r = client.get("/course")
    assert r.status_code == 200


def test_game_page_renders(client):
    r = client.get("/game")
    assert r.status_code == 200


def test_unknown_post_returns_404(client):
    r = client.get("/journal/this-slug-does-not-exist")
    assert r.status_code == 404


def test_unknown_guide_returns_404(client):
    r = client.get("/guide/this-slug-does-not-exist")
    assert r.status_code == 404


def test_unsupported_lang_prefix_returns_html_404(client):
    # /de/... fails the LangPath pattern → RequestValidationError, which must
    # surface as the branded HTML 404 page, never raw 422 JSON.
    for path in ("/de/about", "/fr/course"):
        r = client.get(path)
        assert r.status_code == 404, path
        assert r.headers["content-type"].startswith("text/html"), path
        assert "dcm-ops@nav" in r.text, path


def test_localized_missing_page_with_asset_extension_gets_html_404(client):
    # The /{lang}/ namespace is exempt from asset classification — a human
    # following a bad link gets the HTML 404, not the plaintext bot body.
    r = client.get("/en/journal/foo.json")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("text/html")
    assert "dcm-ops@nav" in r.text


def test_asset_typo_path_gets_plaintext_404(client):
    r = client.get("/sitemap.xml-old")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("text/plain")
    assert r.text.startswith("404 Not Found:")


def test_api_posts_invalid_limit_keeps_422_json(client):
    # The custom validation handler must not swallow real API validation errors.
    r = client.get("/api/posts", params={"limit": 0})
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/json")
    assert "detail" in r.json()


def test_play_index_html_not_cached(client):
    # A cached index.html would keep referencing pruned version-stamped assets.
    r = client.get("/play/index.html")
    assert r.status_code == 200
    assert r.headers.get("cache-control") == "no-cache"


def test_api_posts_returns_list(client):
    r = client.get("/api/posts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "seed_database should populate posts"
    for post in data:
        assert {"slug", "title", "type"}.issubset(post.keys())


def test_api_posts_filter_by_type(client):
    r = client.get("/api/posts", params={"type": "interview"})
    assert r.status_code == 200
    rows = r.json()
    assert all(row["type"] == "interview" for row in rows)


def test_api_guides_returns_list(client):
    r = client.get("/api/guides")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "seed_database should populate scam guides"


def test_api_course_modules_returns_list(client):
    r = client.get("/api/course/modules")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0, "COURSE_MODULES should be seeded"


def test_seeded_guide_detail_renders(client):
    guides = client.get("/api/guides").json()
    slug = guides[0]["slug"]
    r = client.get(f"/guide/{slug}")
    assert r.status_code == 200
    # Jinja auto-escapes — compare against the escaped form so titles
    # containing &/</> don't break the assertion.
    assert str(escape(guides[0]["title"])) in r.text


def test_seeded_post_detail_renders(client):
    posts = client.get("/api/posts").json()
    slug = posts[0]["slug"]
    r = client.get(f"/journal/{slug}")
    assert r.status_code == 200


def test_static_app_js_served(client):
    # A1: the entry bundle now has a content-hashed filename (js/app-<hash>.js)
    # resolved from the Vite manifest — there is no stable /static/js/app.js.
    # Resolve the real entry path from the manifest and assert it serves.
    import json
    from pathlib import Path

    import config

    manifest = json.loads(
        (config.STATIC_DIR / ".vite" / "manifest.json").read_text(encoding="utf-8")
    )
    entry = next(rec for rec in manifest.values() if rec.get("isEntry"))
    r = client.get(f"/static/{entry['file']}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(("application/javascript", "text/javascript"))
    # The old stable name must be gone.
    assert client.get("/static/js/app.js").status_code == 404
