"""Smoke tests — every public surface should at least respond."""
from __future__ import annotations


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
    assert guides[0]["title"] in r.text


def test_seeded_post_detail_renders(client):
    posts = client.get("/api/posts").json()
    slug = posts[0]["slug"]
    r = client.get(f"/journal/{slug}")
    assert r.status_code == 200


def test_static_app_js_served(client):
    r = client.get("/static/js/app.js")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(("application/javascript", "text/javascript"))
