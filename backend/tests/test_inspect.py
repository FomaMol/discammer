"""Tests for Task F2 — the link/URL inspector page.

Covers the SSR /{lang}/inspect route (island mount + no-JS "how to read a link"
checklist) and a guard that every guideSlug used by the client-side heuristic
pack (frontend/src/data/url_heuristics.ts) is a real seeded guide slug, so a
fired finding never links to a 404.
"""
from __future__ import annotations

import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_HEURISTICS_TS = _REPO_ROOT / "frontend" / "src" / "data" / "url_heuristics.ts"


def test_inspect_page_en_mounts_island(client):
    """/en/inspect renders 200 with the LinkInspector island mount."""
    r = client.get("/en/inspect")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert 'data-component="LinkInspector"' in r.text


def test_inspect_page_ru_mounts_island(client):
    """/ru/inspect renders 200 with the LinkInspector island mount."""
    r = client.get("/ru/inspect")
    assert r.status_code == 200
    assert 'data-component="LinkInspector"' in r.text


def test_inspect_page_has_noscript_checklist(client):
    """The no-JS checklist is present so the page works without JS."""
    for lang in ("en", "ru"):
        r = client.get(f"/{lang}/inspect")
        assert r.status_code == 200
        assert "<noscript>" in r.text
        # The localized checklist heading text must render inside the page.
        if lang == "en":
            assert "HOW TO READ A LINK BY HAND" in r.text
        else:
            assert "КАК ЧИТАТЬ ССЫЛКУ ВРУЧНУЮ" in r.text


def test_inspect_legacy_redirect(client):
    """An un-prefixed /inspect 302-redirects to the localized page."""
    r = client.get("/inspect", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] in ("/en/inspect", "/ru/inspect")


def test_inspect_bad_lang_404s(client):
    """A non-supported lang prefix does not resolve the inspect route."""
    r = client.get("/de/inspect")
    assert r.status_code == 404


def _heuristic_guide_slugs() -> set[str]:
    """Parse guideSlug literals out of the TS heuristic pack (no JS runtime)."""
    text = _HEURISTICS_TS.read_text(encoding="utf-8")
    return set(re.findall(r"guideSlug:\s*'([a-z0-9-]+)'", text))


def test_heuristic_guide_slugs_are_all_seeded(client):
    """Every guideSlug a finding can fire links to a real seeded guide.

    The authoritative valid set is whatever /api/guides returns after seeding;
    each slug used by url_heuristics.ts must be a subset of it, so a fired
    finding's "read the phishing guide" link can never 404.
    """
    used = _heuristic_guide_slugs()
    assert used, "expected url_heuristics.ts to declare at least one guideSlug"

    r = client.get("/api/guides", params={"lang": "en"})
    assert r.status_code == 200
    seeded = {g["slug"] for g in r.json() if g.get("slug")}
    assert seeded, "expected /api/guides to return seeded guides"

    missing = used - seeded
    assert missing == set(), f"url_heuristics.ts links to non-seeded guide slugs: {sorted(missing)}"


def test_heuristic_guide_links_resolve_200(client):
    """Each guide a finding links to actually renders (defensive, end-to-end)."""
    for slug in sorted(_heuristic_guide_slugs()):
        r = client.get(f"/en/guide/{slug}")
        assert r.status_code == 200, f"/en/guide/{slug} returned {r.status_code}"
