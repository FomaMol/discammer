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
