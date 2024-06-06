"""Tests for Task F2 — the message red-flag analyzer page.

Covers the SSR /{lang}/check route (island mount + no-JS checklist) and a guard
that every guideSlug used by the client-side rule pack (frontend/src/data/
redflags.ts) is a real seeded guide slug, so a fired flag never links to a 404.
"""
from __future__ import annotations

import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_REDFLAGS_TS = _REPO_ROOT / "frontend" / "src" / "data" / "redflags.ts"


def test_check_page_en_mounts_island(client):
    """/en/check renders 200 with the MessageAnalyzer island mount."""
    r = client.get("/en/check")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert 'data-component="MessageAnalyzer"' in r.text


def test_check_page_ru_mounts_island(client):
    """/ru/check renders 200 with the MessageAnalyzer island mount."""
    r = client.get("/ru/check")
    assert r.status_code == 200
    assert 'data-component="MessageAnalyzer"' in r.text


def test_check_page_has_noscript_checklist(client):
    """The no-JS 60-second checklist is present so the page works without JS."""
    for lang in ("en", "ru"):
        r = client.get(f"/{lang}/check")
        assert r.status_code == 200
        assert "<noscript>" in r.text
        # The localized checklist heading text must render inside the page.
        if lang == "en":
            assert "60-second checklist" in r.text
        else:
            assert "Чек-лист на 60 секунд" in r.text


def test_check_legacy_redirect(client):
    """An un-prefixed /check 302-redirects to the localized page."""
    r = client.get("/check", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] in ("/en/check", "/ru/check")


def test_check_bad_lang_404s(client):
    """A non-supported lang prefix does not resolve the check route."""
    r = client.get("/de/check")
    assert r.status_code == 404


def _redflag_guide_slugs() -> set[str]:
    """Parse guideSlug literals out of the TS rule pack (no JS runtime needed)."""
    text = _REDFLAGS_TS.read_text(encoding="utf-8")
    return set(re.findall(r"guideSlug:\s*'([a-z0-9-]+)'", text))


def test_redflag_guide_slugs_are_all_seeded(client):
    """Every guideSlug a rule can fire links to a real seeded guide.

    The authoritative valid set is whatever /api/guides returns after seeding;
    each slug used by redflags.ts must be a subset of it, so a fired flag's
    "read the matching dossier" link can never 404.
    """
    used = _redflag_guide_slugs()
    assert used, "expected redflags.ts to declare at least one guideSlug"

    r = client.get("/api/guides", params={"lang": "en"})
    assert r.status_code == 200
    seeded = {g["slug"] for g in r.json() if g.get("slug")}
    assert seeded, "expected /api/guides to return seeded guides"

    missing = used - seeded
    assert missing == set(), f"redflags.ts links to non-seeded guide slugs: {sorted(missing)}"


def test_redflag_guide_links_resolve_200(client):
    """Each guide a rule links to actually renders (defensive, end-to-end)."""
    for slug in sorted(_redflag_guide_slugs()):
        r = client.get(f"/en/guide/{slug}")
        assert r.status_code == 200, f"/en/guide/{slug} returned {r.status_code}"
