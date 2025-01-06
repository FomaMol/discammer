"""Editorial provenance checks for the static anti-scam guide catalogue."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import pytest


ROOT = Path(__file__).resolve().parents[2]
CATALOGUE_PATH = ROOT / "content" / "provenance" / "guide-sources.json"
GUIDES_DIR = ROOT / "content" / "guides"


def _authored_guide_slugs() -> set[str]:
    return {path.name.removesuffix(".en.md") for path in GUIDES_DIR.glob("*.en.md")}


def _catalogue() -> dict:
    return json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))


def test_source_catalogue_covers_every_authored_guide_with_bilingual_scope():
    """No guide may silently look source-backed while lacking a catalogue entry."""
    catalogue = _catalogue()
    assert catalogue["version"] == 1
    date.fromisoformat(catalogue["catalogued_at"])
    assert set(catalogue["guides"]) == _authored_guide_slugs()

    for slug, entry in catalogue["guides"].items():
        assert set(entry["scope"]) == {"en", "ru"}, slug
        assert all(entry["scope"].values()), slug
        assert 1 <= len(entry["sources"]) <= 3, slug
        for source in entry["sources"]:
            assert source["publisher"].strip(), (slug, source)
            date.fromisoformat(source["recorded_at"])
            assert set(source["title"]) == {"en", "ru"}, (slug, source)
            assert all(source["title"].values()), (slug, source)
            assert set(source["scope_note"]) == {"en", "ru"}, (slug, source)
            assert all(source["scope_note"].values()), (slug, source)
            parsed = urlparse(source["url"])
            assert parsed.scheme == "https" and parsed.hostname, (slug, source)
            # Each selected publisher is a government or police primary source,
            # not an unsourced blog, affiliate, or commercial safety roundup.
            assert parsed.hostname.endswith((".gov", ".police.uk")), (slug, source)


def test_seed_refuses_missing_or_incomplete_provenance_catalogue(tmp_path, monkeypatch):
    """A bad source record must stop reseeding, not disappear from the UI."""
    import seed_data

    missing = tmp_path / "missing.json"
    monkeypatch.setattr(seed_data, "GUIDE_PROVENANCE_PATH", missing)
    with pytest.raises(ValueError, match="missing"):
        seed_data.load_guide_provenance({"phishing"})

    incomplete = tmp_path / "incomplete.json"
    incomplete.write_text(
        json.dumps(
            {
                "version": 1,
                "catalogued_at": "2026-07-13",
                "guides": {
                    "phishing": {
                        "scope": {"en": "Scope", "ru": "Область"},
                        "sources": [
                            {
                                "publisher": "Example agency",
                                "url": "https://example.gov/phishing",
                                "title": {"en": "Title", "ru": "Название"},
                                "scope_note": {"en": "Note", "ru": "Примечание"}
                            }
                        ]
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(seed_data, "GUIDE_PROVENANCE_PATH", incomplete)
    with pytest.raises(ValueError, match="recorded_at"):
        seed_data.load_guide_provenance({"phishing"})


def test_seeded_guides_expose_locale_specific_sources_in_api_and_ssr(client):
    """API and reading surfaces receive the same checked-in catalogue data."""
    catalogue = _catalogue()
    expected_date = catalogue["catalogued_at"]

    for lang in ("en", "ru"):
        response = client.get("/api/guides", params={"lang": lang})
        assert response.status_code == 200
        guides = response.json()
        assert {guide["slug"] for guide in guides} == _authored_guide_slugs()

        for guide in guides:
            entry = catalogue["guides"][guide["slug"]]
            assert guide["source_catalogued_at"] == expected_date
            assert guide["source_scope"] == entry["scope"][lang]
            assert 1 <= len(guide["sources"]) <= 3
            for source, expected in zip(guide["sources"], entry["sources"], strict=True):
                assert source["title"] == expected["title"][lang]
                assert source["scope_note"] == expected["scope_note"][lang]
                assert source["recorded_at"] == expected["recorded_at"]

        sample = guides[0]
        page = client.get(f"/{lang}/guide/{sample['slug']}")
        assert page.status_code == 200
        assert sample["source_scope"] in page.text
        assert sample["sources"][0]["title"] in page.text
        assert "LAST_REVIEWED" not in page.text
        assert "ПОСЛЕДНЯЯ_ПРОВЕРКА" not in page.text
