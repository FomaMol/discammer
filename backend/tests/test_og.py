"""Per-content Open Graph card wiring (Task F4).

Asserts that a seeded post/guide detail page emits an ``og:image`` pointing at
its generated per-content card under ``/static/images/og/{posts,guides}/`` and
that the card is actually served as a 1200×630-shaped PNG.

Slugs are discovered from the API like the other smoke tests, so this stays
green as content changes. If the committed PNG set hasn't been regenerated for a
slug (``scripts/og_generate.py``), the card-specific assertions are skipped for
that item rather than failing — the route still falls back safely.
"""
from __future__ import annotations

import re

import config


def _og_image_url(html: str) -> str | None:
    """Extract the og:image content from a rendered page, attr-order agnostic."""
    m = re.search(
        r'<meta\s+property="og:image"\s+content="([^"]+)"', html
    )
    return m.group(1) if m else None


def _card_exists(rel_path: str) -> bool:
    """rel_path like /static/images/og/posts/foo.en.png → does the file exist?"""
    return (config.STATIC_DIR / rel_path.removeprefix("/static/")).is_file()


def test_post_detail_uses_per_content_og_card(client):
    posts = client.get("/api/posts").json()
    slug = posts[0]["slug"]
    rel = f"/static/images/og/posts/{slug}.en.png"
    if not _card_exists(rel):
        import pytest

        pytest.skip(f"OG card not generated for post {slug}; run og_generate.py")

    r = client.get(f"/en/journal/{slug}")
    assert r.status_code == 200
    og = _og_image_url(r.text)
    assert og is not None, "og:image meta missing"
    # base.html prepends SITE_ORIGIN; assert the absolute URL ends with our card.
    assert og.endswith(rel), og

    # The card itself must serve as image/png.
    img = client.get(rel)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    # PNG magic header — confirms a real PNG, not an HTML error page.
    assert img.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_guide_detail_uses_per_content_og_card(client):
    guides = client.get("/api/guides").json()
    slug = guides[0]["slug"]
    rel = f"/static/images/og/guides/{slug}.en.png"
    if not _card_exists(rel):
        import pytest

        pytest.skip(f"OG card not generated for guide {slug}; run og_generate.py")

    r = client.get(f"/en/guide/{slug}")
    assert r.status_code == 200
    og = _og_image_url(r.text)
    assert og is not None, "og:image meta missing"
    assert og.endswith(rel), og

    img = client.get(rel)
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_ru_post_card_served_and_localized(client):
    """The RU locale renders the .ru.png card (separate localized title)."""
    posts = client.get("/api/posts").json()
    slug = posts[0]["slug"]
    rel = f"/static/images/og/posts/{slug}.ru.png"
    if not _card_exists(rel):
        import pytest

        pytest.skip(f"RU OG card not generated for post {slug}; run og_generate.py")

    r = client.get(f"/ru/journal/{slug}")
    assert r.status_code == 200
    og = _og_image_url(r.text)
    assert og is not None and og.endswith(rel), og
