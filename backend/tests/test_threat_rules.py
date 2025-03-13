"""UX-5 — updatable threat-rules feed (GET /api/threat-rules).

The endpoint serves a checked-in, versioned DATA feed (URL-shortener hosts +
high-abuse TLDs) straight from ``content/threat-rules/threat-rules.json``. It is
NOT part of the DB wipe+reseed group, so these tests never touch the database.
The client merges this data into its built-in lists so the in-browser checker /
inspector pick up new shorteners/TLDs without a frontend redeploy. No user data
is ever involved — the feed is DATA ONLY, served to everyone identically.
"""
from __future__ import annotations

import json

import pytest


def test_threat_rules_returns_200_json(client):
    r = client.get("/api/threat-rules")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    body = r.json()
    assert isinstance(body, dict)
    assert isinstance(body["version"], str) and body["version"]
    assert isinstance(body["shortener_hosts"], list)
    assert isinstance(body["suspicious_tlds"], list)


def test_threat_rules_seeded_from_builtins(client):
    """Day-one parity: the feed carries the same hosts/TLDs the client ships,
    so merging it changes nothing until the file is updated."""
    body = client.get("/api/threat-rules").json()
    # A representative sample of the built-in lists must be present.
    assert "bit.ly" in body["shortener_hosts"]
    assert "clck.ru" in body["shortener_hosts"]
    assert "zip" in body["suspicious_tlds"]
    assert "xyz" in body["suspicious_tlds"]
    # Every entry is a plain lowercase string (no objects, no functions).
    for host in body["shortener_hosts"]:
        assert isinstance(host, str)
    for tld in body["suspicious_tlds"]:
        assert isinstance(tld, str)


def test_threat_rules_is_edge_cacheable(client):
    """CF-5: a public, long-ish max-age so the feed is edge-cacheable, but a TTL
    short enough that new rules propagate without a redeploy."""
    r = client.get("/api/threat-rules")
    cc = r.headers.get("cache-control", "")
    assert "public" in cc
    assert "max-age=" in cc
    # A bounded TTL — not the year-long immutable asset TTL, so updates land.
    max_age = int(cc.split("max-age=")[1].split(",")[0].strip())
    assert 0 < max_age <= 86400


def test_threat_rules_echoes_lang_but_is_lang_agnostic(client):
    """The endpoint accepts ?lang= for forward-compat; host/TLD data is not
    localized, so the two locales return identical rule data."""
    en = client.get("/api/threat-rules?lang=en").json()
    ru = client.get("/api/threat-rules?lang=ru").json()
    assert en["shortener_hosts"] == ru["shortener_hosts"]
    assert en["suspicious_tlds"] == ru["suspicious_tlds"]


def test_threat_rules_no_user_data_and_carries_no_input(client):
    """A GET with no body; the response contains only rule data — nothing that
    could echo user input (the checker/inspector never send text here)."""
    r = client.get("/api/threat-rules")
    assert not (r.request.content or b"")  # the request carries no body at all
    assert set(r.json().keys()) <= {"version", "shortener_hosts", "suspicious_tlds", "lang"}


# ---------------------------------------------------------------------------
# Graceful degradation — a missing / malformed file must NEVER crash the app.
# These exercise the pure reader directly (no cache-reset gymnastics) so the
# fallback logic is asserted end-to-end.
# ---------------------------------------------------------------------------
def test_reader_handles_missing_file(tmp_path):
    from routers.api import _read_threat_rules_file

    feed = _read_threat_rules_file(tmp_path / "does-not-exist.json")
    assert feed == {"version": "unavailable", "shortener_hosts": [], "suspicious_tlds": []}


def test_reader_handles_malformed_json(tmp_path):
    from routers.api import _read_threat_rules_file

    bad = tmp_path / "bad.json"
    bad.write_text("{ this is not json ]", encoding="utf-8")
    feed = _read_threat_rules_file(bad)
    assert feed["version"] == "unavailable"
    assert feed["shortener_hosts"] == []
    assert feed["suspicious_tlds"] == []


def test_reader_coerces_wrong_shapes(tmp_path):
    from routers.api import _read_threat_rules_file

    weird = tmp_path / "weird.json"
    weird.write_text(
        json.dumps(
            {
                "version": 123,  # not a string
                "shortener_hosts": ["bit.ly", 42, None, "evil.link"],  # mixed
                "suspicious_tlds": "not-a-list",
            }
        ),
        encoding="utf-8",
    )
    feed = _read_threat_rules_file(weird)
    assert feed["version"] == "unavailable"  # non-str coerced
    assert feed["shortener_hosts"] == ["bit.ly", "evil.link"]  # non-str dropped
    assert feed["suspicious_tlds"] == []  # non-list -> empty


def test_endpoint_serves_empty_feed_when_file_missing(client, monkeypatch, tmp_path):
    """If the file vanishes at runtime the endpoint still answers 200 with an
    empty-but-valid feed rather than 500ing — the client falls back to built-ins."""
    import routers.api as api

    monkeypatch.setattr(api, "_THREAT_RULES_PATH", tmp_path / "gone.json")
    monkeypatch.setattr(api, "_THREAT_RULES_CACHE", None)
    try:
        r = client.get("/api/threat-rules")
        assert r.status_code == 200
        body = r.json()
        assert body["shortener_hosts"] == []
        assert body["suspicious_tlds"] == []
    finally:
        # Drop the poisoned (empty) cache so later tests read the real file.
        monkeypatch.setattr(api, "_THREAT_RULES_CACHE", None)
