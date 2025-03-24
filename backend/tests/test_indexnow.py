"""SEO-3 — the IndexNow key-ownership file (`GET /<key>.txt`).

IndexNow (scripts/indexnow-ping.sh, wired into deploy.sh) notifies Bing/Yandex
of changed URLs. Those engines only trust a submission when the origin proves
key ownership by serving `<key>.txt` at the site root with the key as its body.

The route is OPT-IN: with `INDEXNOW_KEY` unset it 404s (no new public surface).
When set it serves the key verbatim as text/plain, and it must not shadow the
explicit `/robots.txt` route or leak the key to a probe for a different name.
"""
from __future__ import annotations

import pytest

import config

_VALID_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"  # 32 hex chars, valid per spec


def test_key_file_404_when_unset(client):
    """Default config has no key — the route adds no surface (plain 404)."""
    # Guard: the shipped default is empty so the feature is off out of the box.
    assert config.INDEXNOW_KEY == ""
    r = client.get(f"/{_VALID_KEY}.txt")
    assert r.status_code == 404


def test_key_file_served_when_set(client, monkeypatch):
    """With a valid key configured, `/<key>.txt` returns the key as plain text."""
    monkeypatch.setattr(config, "INDEXNOW_KEY", _VALID_KEY)
    r = client.get(f"/{_VALID_KEY}.txt")
    assert r.status_code == 200
    assert r.text == _VALID_KEY
    assert r.headers["content-type"].startswith("text/plain")


def test_wrong_key_is_404(client, monkeypatch):
    """A probe for a `.txt` name that isn't the configured key gets a plain 404,
    so the ownership token can't be discovered by guessing filenames."""
    monkeypatch.setattr(config, "INDEXNOW_KEY", _VALID_KEY)
    r = client.get("/some-other-key-000000.txt")
    assert r.status_code == 404


def test_malformed_configured_key_treated_as_unset(client, monkeypatch):
    """A too-short / out-of-charset key is invalid per the IndexNow spec and is
    treated as unset, so a typo'd env value never publishes a bogus file."""
    monkeypatch.setattr(config, "INDEXNOW_KEY", "abc")  # < 8 chars
    r = client.get("/abc.txt")
    assert r.status_code == 404


def test_robots_txt_not_shadowed(client, monkeypatch):
    """The dynamic `*.txt` route must not shadow the explicit robots.txt route,
    even when a key is set (robots is registered first)."""
    monkeypatch.setattr(config, "INDEXNOW_KEY", _VALID_KEY)
    r = client.get("/robots.txt")
    assert r.status_code == 200
    assert "Sitemap:" in r.text
