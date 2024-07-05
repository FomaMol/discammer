"""O1 — privacy-safe client error beacon endpoint.

Covers ``POST /api/client-errors`` in ``main.py``:
- a normal report returns 204 and structured-logs one scrubbed line carrying
  ONLY {rid, name, message_class, ua_family} — never any raw message, stack, or
  user-entered field;
- an oversized body (> ~2 KB) is rejected with 413 before parsing;
- a flood from one IP is rate-limited to 429 after the configured ceiling, with
  no log spam;
- a payload that smuggles a "message"/"pasted"/"stack" field is re-scrubbed
  server-side so none of that text reaches the log record (defense in depth).
"""
from __future__ import annotations

import logging

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Each test starts with a fresh in-memory token bucket so flood tests in
    one test don't starve the 204 path in another (TestClient reuses 'testclient'
    as the client IP)."""
    import main

    if hasattr(main, "_client_error_buckets"):
        main._client_error_buckets.clear()
    yield
    if hasattr(main, "_client_error_buckets"):
        main._client_error_buckets.clear()


def test_normal_report_returns_204_and_logs_scrubbed_line(client, caplog):
    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    try:
        r = client.post(
            "/api/client-errors",
            json={"name": "TypeError", "messageClass": "TypeError/short", "location": "ContentCarousel"},
            headers={"X-Request-ID": "beacon-1", "User-Agent": "Mozilla/5.0 Firefox/123.0"},
        )
    finally:
        discammer_logger.removeHandler(caplog.handler)

    assert r.status_code == 204
    assert r.content == b""

    recs = [
        rec
        for rec in caplog.records
        if rec.name == "discammer" and getattr(rec, "rid", None) == "beacon-1"
    ]
    assert recs, "the beacon should structured-log one line carrying the rid"
    rec = recs[0]
    # Only the allowed scrubbed fields may appear. The scrubbed error class is
    # carried as ``error_name`` (``name`` is a reserved LogRecord attribute).
    assert getattr(rec, "error_name", None) == "TypeError"
    assert getattr(rec, "message_class", None)
    assert getattr(rec, "ua_family", None) == "firefox"  # coarse UA family, never the full UA string


def test_oversized_body_rejected_413(client):
    big = "x" * 5000
    r = client.post(
        "/api/client-errors",
        content=('{"name":"E","messageClass":"E/x","location":"%s"}' % big).encode(),
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413


def test_flood_is_rate_limited_to_429(client, caplog):
    import config

    caplog.set_level(logging.INFO, logger="discammer")
    limit = config.CLIENT_ERROR_RATE_LIMIT
    statuses = []
    for _ in range(limit + 5):
        r = client.post(
            "/api/client-errors",
            json={"name": "E", "messageClass": "E/short", "location": "X"},
        )
        statuses.append(r.status_code)

    assert 204 in statuses, "the first requests under the limit must succeed"
    assert 429 in statuses, "requests over the per-IP limit must be rejected with 429"
    # Over-limit (429) responses must NOT emit a discammer beacon log line.
    over_limit_logs = [
        rec for rec in caplog.records if "rate" in rec.getMessage().lower() and rec.name == "discammer"
    ]
    assert not over_limit_logs, "429s must not spam the log"


def test_smuggled_user_content_is_scrubbed_server_side(client, caplog):
    """A payload carrying a raw message / pasted / stack field must NOT leak
    that text into the log record — the server re-scrubs and only keeps the
    coarse allowlisted fields."""
    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    secret = "MY_CREDIT_CARD_4111111111111111"
    try:
        r = client.post(
            "/api/client-errors",
            json={
                "name": "TypeError",
                "messageClass": "TypeError/short",
                "location": "Widget",
                # Smuggled user content — must never reach the log.
                "message": secret,
                "pasted": secret,
                "stack": secret,
                "query": secret,
            },
            headers={"X-Request-ID": "beacon-leak"},
        )
    finally:
        discammer_logger.removeHandler(caplog.handler)

    assert r.status_code == 204
    # The secret must not appear anywhere in the captured log output.
    for rec in caplog.records:
        if rec.name != "discammer":
            continue
        assert secret not in rec.getMessage()
        for attr in vars(rec).values():
            assert secret not in str(attr), "smuggled user content leaked into a log field"


def test_bad_name_is_coerced_not_logged_raw(client, caplog):
    """An attacker-supplied 'name' that is actually a long user string must be
    bounded/sanitised — not echoed verbatim into the log."""
    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    evil = "Error: user typed their password hunter2 and a long paragraph " * 5
    try:
        r = client.post(
            "/api/client-errors",
            json={"name": evil, "messageClass": "x", "location": "Y"},
            headers={"X-Request-ID": "beacon-evil"},
        )
    finally:
        discammer_logger.removeHandler(caplog.handler)

    assert r.status_code == 204
    for rec in caplog.records:
        if rec.name != "discammer":
            continue
        assert "hunter2" not in rec.getMessage()
        for attr in vars(rec).values():
            assert "hunter2" not in str(attr)
