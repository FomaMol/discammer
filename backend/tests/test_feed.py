"""F3 — RSS feed (/feed.xml served by routers/seo.py).

NOTE: the v4 plan said "create routers/feeds.py with GET /feed.xml", but
seo.py already serves a complete RSS 2.0 /feed.xml. A second /feed.xml route
would double-register and shadow one, so F3 enhanced the existing route
(limit 20 → 30, all post types) instead of adding feeds.py. These tests cover
the served feed and the asset-typo 404 classification.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET


def test_feed_xml_served(client):
    r = client.get("/feed.xml")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/rss+xml")


def test_feed_xml_is_valid_and_bounded(client):
    r = client.get("/feed.xml")
    assert r.status_code == 200

    # Valid XML.
    root = ET.fromstring(r.text)
    channel = root.find("channel")
    assert channel is not None

    items = channel.findall("item")
    assert len(items) >= 1, "feed should contain at least one item after seed"
    assert len(items) <= 30, "feed is capped at 30 items"

    # Item count must equal min(total posts, 30).
    posts = client.get("/api/posts").json()
    total = len([p for p in posts if p.get("slug")])
    assert len(items) == min(total, 30)


def test_feed_xml_typo_gets_plaintext_404(client):
    # /feed.xml-old isn't the real feed — the _is_asset_path classifier in
    # main.py matches ".xml" anywhere in the path, so it gets a plaintext 404,
    # not the branded HTML 404 page.
    r = client.get("/feed.xml-old")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("text/plain")
    assert r.text.startswith("404 Not Found:")
