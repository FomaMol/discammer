"""O1 — structured request logging + request IDs.

Covers the ``@app.middleware("http")`` request logger in ``main.py``:
- every response carries an ``X-Request-ID`` header,
- a client-supplied ``X-Request-ID`` is echoed back unchanged,
- the "discammer" logger emits one record per request carrying the rid and a
  request duration (via ``extra=``).
"""
from __future__ import annotations

import logging


def test_response_has_request_id_header(client):
    r = client.get("/en/")
    assert r.status_code == 200
    rid = r.headers.get("X-Request-ID")
    assert rid, "every response must carry an X-Request-ID header"
    assert len(rid) >= 8


def test_supplied_request_id_is_echoed(client):
    r = client.get("/en/", headers={"X-Request-ID": "abc123"})
    assert r.status_code == 200
    assert r.headers.get("X-Request-ID") == "abc123"


def test_logger_emits_rid_and_duration(client, caplog):
    # The "discammer" logger sets ``propagate = False`` (so the root logger /
    # uvicorn doesn't re-emit the line in prod). caplog's capture handler lives
    # on the root logger, so attach it directly to the discammer logger for the
    # duration of this test to observe the records it emits.
    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    try:
        r = client.get("/en/", headers={"X-Request-ID": "trace-xyz"})
    finally:
        discammer_logger.removeHandler(caplog.handler)
    assert r.status_code == 200

    records = [rec for rec in caplog.records if rec.name == "discammer"]
    assert records, "the discammer logger should emit a record for a normal GET"

    rec = next(
        (rec for rec in records if getattr(rec, "rid", None) == "trace-xyz"),
        None,
    )
    assert rec is not None, "the request log record must carry the supplied rid"
    # duration is attached via extra= and must be a real number.
    assert isinstance(getattr(rec, "duration_ms", None), (int, float))
    assert rec.duration_ms >= 0
    assert getattr(rec, "method", None) == "GET"
    assert getattr(rec, "path", None) == "/en/"
    assert getattr(rec, "status", None) == 200
