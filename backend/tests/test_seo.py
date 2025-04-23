"""SEO-2 structured data — the WebSite node advertises a sitelinks SearchAction.

Also a light guard that every JSON-LD block on a page stays parseable, so a
template edit that breaks the JSON (trailing comma, bad interpolation) fails
loudly instead of silently shipping invalid structured data.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urlsplit

import pytest

_LD_JSON = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.DOTALL,
)

_CANONICAL = re.compile(r'<link rel="canonical" href="([^"]+)">')


def _ld_blocks(html: str) -> list[dict]:
    blocks = []
    for raw in _LD_JSON.findall(html):
        blocks.append(json.loads(raw))  # raises on invalid JSON — that's the guard
    return blocks


def _website_node(html: str) -> dict:
    for block in _ld_blocks(html):
        nodes = block.get("@graph", [block])
        for node in nodes:
            if node.get("@type") == "WebSite":
                return node
    raise AssertionError("no WebSite JSON-LD node found")


@pytest.mark.parametrize("lang", ["en", "ru"])
def test_website_has_localized_search_action(client, lang):
    r = client.get(f"/{lang}/")
    assert r.status_code == 200
    site = _website_node(r.text)

    action = site.get("potentialAction")
    assert action, "WebSite must expose a potentialAction (sitelinks searchbox)"
    assert action["@type"] == "SearchAction"
    # The searchbox target is the current locale's SSR search endpoint, with the
    # schema.org placeholder left literal for Google to substitute.
    target = action["target"]
    assert target["@type"] == "EntryPoint"
    assert target["urlTemplate"].endswith(f"/{lang}/search?q={{search_term_string}}")
    assert action["query-input"] == "required name=search_term_string"


def test_all_ld_json_blocks_parse_on_key_pages(client):
    # A broken JSON-LD block on any of these would throw inside _ld_blocks.
    for path in ("/en/", "/ru/", "/en/guide/phishing", "/en/journal", "/en/course"):
        r = client.get(path)
        assert r.status_code == 200
        blocks = _ld_blocks(r.text)
        assert blocks, f"{path} should carry at least the base JSON-LD"


# ---------------------------------------------------------------------------
# BreadcrumbList — absolute `item` URLs anchored to the SAME trusted origin as
# <link rel="canonical">.
#
# Regression: the crumbs were built from `request.url._url`, whose scheme comes
# from the untrusted ASGI scope. Behind the prod nginx proxy that serialized
# `http://…` while the canonical (built from config.SITE_ORIGIN via base.html's
# `_origin`) serialized `https://discammer.com/…`, so Google saw the
# BreadcrumbList disagreeing with the canonical it points at. The TestClient's
# http://testserver base_url reproduces exactly that split.
# ---------------------------------------------------------------------------


def _canonical_url(html: str) -> str:
    match = _CANONICAL.search(html)
    assert match, "page must declare <link rel='canonical'>"
    return match.group(1)


def _breadcrumb_node(html: str) -> dict:
    for block in _ld_blocks(html):
        for node in block.get("@graph", [block]):
            if node.get("@type") == "BreadcrumbList":
                return node
    raise AssertionError("no BreadcrumbList JSON-LD node found")


# Every SSR surface that carries a breadcrumb trail, in both locales.
_BREADCRUMB_PATHS = [
    f"/{lang}/{suffix}"
    for lang in ("en", "ru")
    for suffix in (
        "",
        "journal",
        "journal/the-story-of-alex-chen",
        "guide/phishing",
        "course",
        "course/threat-fundamentals",
        "course/threat-fundamentals/attack-vectors",
        "check",
        "inspect",
        "search",
    )
]


@pytest.mark.parametrize("path", _BREADCRUMB_PATHS)
def test_breadcrumb_items_share_the_canonical_origin(client, path):
    r = client.get(path)
    assert r.status_code == 200

    canonical = urlsplit(_canonical_url(r.text))
    crumbs = _breadcrumb_node(r.text)["itemListElement"]
    assert crumbs, f"{path} BreadcrumbList must list items"

    for crumb in crumbs:
        item = urlsplit(crumb["item"])
        assert (item.scheme, item.netloc) == (canonical.scheme, canonical.netloc), (
            f"{path} crumb {crumb['position']} ({crumb['item']}) must use the same "
            f"origin as the canonical ({canonical.scheme}://{canonical.netloc})"
        )


@pytest.mark.parametrize("path", _BREADCRUMB_PATHS)
def test_breadcrumb_leaf_is_the_canonical_url(client, path):
    """The last crumb IS this page — it must serialize as the canonical does."""
    r = client.get(path)
    assert r.status_code == 200

    crumbs = _breadcrumb_node(r.text)["itemListElement"]
    assert crumbs[-1]["item"] == _canonical_url(r.text)


def test_breadcrumb_leaf_ignores_query_string(client):
    """Canonical drops ?utm_*; the crumb pointing at it must too, or the two
    disagree again on any campaign-tagged landing."""
    r = client.get("/en/search?q=phishing&utm_source=newsletter")
    assert r.status_code == 200

    crumbs = _breadcrumb_node(r.text)["itemListElement"]
    assert crumbs[-1]["item"] == _canonical_url(r.text)
    assert "utm_source" not in crumbs[-1]["item"]


@pytest.mark.parametrize("lang", ["en", "ru"])
@pytest.mark.parametrize("suffix", ["check", "inspect", "search"])
def test_tool_pages_mark_up_their_visible_breadcrumb(client, lang, suffix):
    """SEO-2 step 2: the tool pages render a visual breadcrumb, so the
    BreadcrumbList must mirror it — home → this page."""
    r = client.get(f"/{lang}/{suffix}")
    assert r.status_code == 200

    crumbs = _breadcrumb_node(r.text)["itemListElement"]
    assert [c["position"] for c in crumbs] == [1, 2]
    assert crumbs[0]["item"].endswith(f"/{lang}/")
    assert crumbs[1]["item"].endswith(f"/{lang}/{suffix}")
