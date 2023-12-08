"""Tests for the markdown sanitizer — verify XSS payloads are stripped
and that the iframe host allowlist is enforced."""
from __future__ import annotations

import sys
from pathlib import Path

# Backend dir is on sys.path via pytest.ini (pythonpath = backend), but tests
# import this module directly so be defensive.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from markdown_renderer import render_markdown


def test_script_tags_stripped():
    # bleach strips the tag but preserves inner text as plaintext — the text
    # is no longer executable so this is safe. We only need to verify no
    # <script> tag survives.
    out = render_markdown("Hello <script>alert(1)</script> world")
    assert "<script" not in out.lower()
    assert "</script" not in out.lower()


def test_on_event_handlers_stripped():
    out = render_markdown('<a href="/" onclick="alert(1)">x</a>')
    assert "onclick" not in out


def test_javascript_href_blocked():
    out = render_markdown('<a href="javascript:alert(1)">x</a>')
    assert "javascript:" not in out


def test_allowed_iframe_host_preserved():
    md = '<iframe src="https://youtube.com/embed/abc"></iframe>'
    out = render_markdown(md)
    assert "youtube.com/embed/abc" in out


def test_disallowed_iframe_host_stripped():
    md = '<iframe src="https://evil.example.com/x"></iframe>'
    out = render_markdown(md)
    assert "evil.example.com" not in out


def test_basic_markdown_renders():
    out = render_markdown("# Heading\n\nParagraph.")
    assert "<h1" in out
    assert "Paragraph." in out
