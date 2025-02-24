"""SEO-2 structured data — the WebSite node advertises a sitelinks SearchAction.

Also a light guard that every JSON-LD block on a page stays parseable, so a
template edit that breaks the JSON (trailing comma, bad interpolation) fails
loudly instead of silently shipping invalid structured data.
"""
from __future__ import annotations

import json
import re

import pytest

_LD_JSON = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.DOTALL,
)


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
