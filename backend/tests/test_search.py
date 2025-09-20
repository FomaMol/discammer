"""Tests for Task F1 — site search (SQLite FTS5).

Covers the FTS index build, the /api/search endpoint (relevance, injection
inertness, snippet HTML safety) and the SSR /{lang}/search page.
"""
from __future__ import annotations

import sqlite3

import pytest

import config


def _table_count(table: str) -> int:
    """Row count of ``table`` in the seeded temp DB (sync sqlite3, no event loop)."""
    con = sqlite3.connect(config.DATABASE_PATH)
    try:
        return con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        con.close()


def test_fts_index_row_count_matches_content(client):
    """content_fts holds exactly (#posts + #guides) rows across both locales."""
    posts = _table_count("post")
    guides = _table_count("scam_guide")
    fts = _table_count("content_fts")
    expected = posts + guides
    assert fts > 0, "content_fts should be populated after seed"
    assert fts == expected, f"fts={fts} expected posts+guides={expected}"


def test_search_finds_phishing_guide(client):
    """A query for 'phishing' surfaces the phishing guide via /api/search."""
    r = client.get("/api/search", params={"q": "phishing", "lang": "en"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any(
        row["kind"] == "guide" and row["slug"] == "phishing" for row in data
    ), f"phishing guide missing from results: {[(d['kind'], d['slug']) for d in data]}"


def test_search_blank_query_returns_empty_list(client):
    for q in ("", "   "):
        r = client.get("/api/search", params={"q": q, "lang": "en"})
        assert r.status_code == 200
        assert r.json() == []


def test_search_injection_is_inert(client):
    """A SQL/FTS injection attempt returns 200 and never drops the post table."""
    before = _table_count("post")
    assert before > 0

    r = client.get(
        "/api/search",
        params={"q": '"; DROP TABLE post;--', "lang": "en"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)  # empty or harmless, but never an error

    after = _table_count("post")
    assert after == before, "post table must be untouched by the injection query"


def test_search_kind_filter(client):
    """kind=guide restricts results to guides only."""
    r = client.get(
        "/api/search", params={"q": "scam", "kind": "guide", "lang": "en", "limit": 20}
    )
    assert r.status_code == 200
    data = r.json()
    assert data, "expected at least one guide result for 'scam'"
    assert all(row["kind"] == "guide" for row in data)


def test_snippet_html_escapes_content_angle_brackets(client):
    """No snippet_html contains an unescaped '<' that isn't part of <mark>/</mark>.

    Any angle bracket from indexed CONTENT must arrive HTML-escaped (&lt;), so
    the only literal '<' allowed in snippet_html is the opening of a <mark> or
    </mark> tag.
    """
    # 'scam' surfaces many bodies; check every returned snippet across locales.
    found_any = False
    for lang in ("en", "ru"):
        r = client.get("/api/search", params={"q": "scam", "lang": lang, "limit": 20})
        assert r.status_code == 200
        for row in r.json():
            html = row["snippet_html"]
            found_any = True
            # Strip the sanctioned mark tags, then assert no '<' remains.
            stripped = html.replace("<mark>", "").replace("</mark>", "")
            assert "<" not in stripped, f"unescaped '<' in snippet: {html!r}"
            # And the markers must never leak as raw control chars.
            assert "\x01" not in html and "\x02" not in html
    assert found_any, "expected at least one snippet to inspect"


def test_search_results_carry_marked_highlight(client):
    """At least one phishing result highlights the term with <mark>."""
    r = client.get("/api/search", params={"q": "phishing", "lang": "en", "limit": 20})
    assert r.status_code == 200
    assert any("<mark>" in row["snippet_html"] for row in r.json())


def test_search_page_ssr_renders_phishing_link(client):
    """/{lang}/search?q=phishing renders SSR results with a link to the guide."""
    r = client.get("/en/search", params={"q": "phishing"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "/en/guide/phishing" in r.text


def test_search_page_empty_state(client):
    """/{lang}/search with no query renders the empty-state explainer page."""
    r = client.get("/en/search")
    assert r.status_code == 200
    # The SSR form must be present so the page works without JS.
    assert 'action="/en/search"' in r.text
    assert 'name="q"' in r.text


def test_search_page_marks_are_real_html(client):
    """SSR snippet highlight is real <mark>, content angle brackets are escaped."""
    r = client.get("/en/search", params={"q": "phishing"})
    assert r.status_code == 200
    # The snippet paragraph carries the dcm-snippet class; somewhere a <mark> is
    # rendered (marked safe), proving escape-then-mark ran server-side.
    assert "dcm-snippet" in r.text
    assert "<mark>" in r.text


# ---------------------------------------------------------------------------
# Control characters in ?q= (2026-08-01 production probe).
#
# `GET /api/search?q=%00` and `/{lang}/search?q=%00` both returned an unhandled
# 500 on production. `_build_match_terms` quotes every term into an FTS5 string
# literal, so this is not injection and nothing leaked — but SQLite reads bound
# text as a C string, so an embedded NUL truncates it and the MATCH parser
# aborts with "unterminated string". An unauthenticated one-parameter way to
# manufacture origin 500s, which Cloudflare does not absorb (DYNAMIC).
#
# The rest of C0 and DEL are stripped as inert noise, not as a defence. In
# particular \x01/\x02 are SNIPPET_OPEN/SNIPPET_CLOSE, but a query can never
# reach snippet output: snippet() builds its result from the INDEXED content and
# takes the sentinels as bound parameters, while the query only ever becomes the
# MATCH expression. Do not read these cases as guarding escape-then-mark.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    ["\x00", "phishing\x00", "\x01open", "close\x02", "\x00\x01\x02", "a\x1fb"],
)
def test_search_survives_control_characters(client, raw):
    """Control chars must degrade to a clean result, never a 500."""
    r = client.get("/api/search", params={"q": raw})
    assert r.status_code == 200, f"{raw!r} -> {r.status_code}"
    assert isinstance(r.json(), list)


@pytest.mark.parametrize("lang", ["en", "ru"])
def test_search_page_survives_control_characters(client, lang):
    """The user-facing page must not answer a crafted URL with a bare 500."""
    r = client.get(f"/{lang}/search", params={"q": "\x00"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")


def test_control_chars_do_not_reach_the_match_expression():
    """Stripping happens in the term builder, so every caller is covered."""
    from database import _build_match_terms

    terms = _build_match_terms("phi\x00shing \x01\x02 ok")
    joined = " ".join(terms)
    for ch in ("\x00", "\x01", "\x02"):
        assert ch not in joined, f"{ch!r} survived into {joined!r}"
    # A term that was ONLY control characters must vanish rather than become "".
    assert '""*' not in joined
    assert '"phishing"*' in joined
    assert '"ok"*' in joined
