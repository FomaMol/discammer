"""SEO-1 — sitemap.xml hreflang alternates.

Each <url> must carry xhtml:link rel="alternate" hreflang for every locale plus
x-default (→ en), with the xhtml namespace declared, so Google links /en and /ru
instead of treating them as duplicates. Validates as XML.
"""
from __future__ import annotations

from xml.etree import ElementTree as ET

SM = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
XH = "{http://www.w3.org/1999/xhtml}"


def test_sitemap_has_hreflang_alternates(client):
    r = client.get("/sitemap.xml")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/xml")

    root = ET.fromstring(r.text)  # must be well-formed XML
    urls = root.findall(f"{SM}url")
    assert urls, "sitemap should list URLs after seed"

    # Find the English home entry and assert its alternates.
    home = next(
        u for u in urls if u.findtext(f"{SM}loc", "").endswith("/en/")
    )
    links = home.findall(f"{XH}link")
    by_lang = {l.get("hreflang"): l.get("href") for l in links}
    assert by_lang.get("en", "").endswith("/en/")
    assert by_lang.get("ru", "").endswith("/ru/")
    assert by_lang.get("x-default", "").endswith("/en/"), "x-default must point to en"


def test_sitemap_guide_pages_are_localized_pairs(client):
    r = client.get("/sitemap.xml")
    root = ET.fromstring(r.text)
    locs = [u.findtext(f"{SM}loc", "") for u in root.findall(f"{SM}url")]
    guide_en = [l for l in locs if "/en/guide/" in l]
    assert guide_en, "expected guide pages in sitemap"
    # Every en guide must have a ru counterpart at the same suffix.
    for l in guide_en:
        assert l.replace("/en/guide/", "/ru/guide/") in locs


def test_sitemap_includes_localized_portfolio_dossier(client):
    r = client.get("/sitemap.xml")
    root = ET.fromstring(r.text)
    locs = [u.findtext(f"{SM}loc", "") for u in root.findall(f"{SM}url")]
    assert any(url.endswith("/en/portfolio") for url in locs)
    assert any(url.endswith("/ru/portfolio") for url in locs)


def test_sitemap_includes_localized_tool_pages(client):
    """The two flagship tool pages are crawlable, canonicalized, hreflang-paired
    and linked from nav — robots.txt lets crawlers have them, so the sitemap
    (whose contract is every localized canonical URL) must list them too."""
    r = client.get("/sitemap.xml")
    root = ET.fromstring(r.text)
    locs = [u.findtext(f"{SM}loc", "") for u in root.findall(f"{SM}url")]
    for suffix in ("check", "inspect"):
        for lang in ("en", "ru"):
            assert any(
                url.endswith(f"/{lang}/{suffix}") for url in locs
            ), f"sitemap must list /{lang}/{suffix}"


def test_sitemap_tool_pages_carry_hreflang_alternates(client):
    """SEO-1 puts xhtml:link alternates inside every <url>; the tool pages are
    not allowed to be the exception."""
    r = client.get("/sitemap.xml")
    root = ET.fromstring(r.text)

    for suffix in ("check", "inspect"):
        entry = next(
            u
            for u in root.findall(f"{SM}url")
            if u.findtext(f"{SM}loc", "").endswith(f"/en/{suffix}")
        )
        by_lang = {l.get("hreflang"): l.get("href") for l in entry.findall(f"{XH}link")}
        assert by_lang.get("en", "").endswith(f"/en/{suffix}")
        assert by_lang.get("ru", "").endswith(f"/ru/{suffix}")
        assert by_lang.get("x-default", "").endswith(f"/en/{suffix}")
