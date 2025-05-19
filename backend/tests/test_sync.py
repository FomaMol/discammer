"""UX-4 · sync endpoint contract.

The server is assumed hostile in this design: it stores an opaque client-encrypted
blob under an id derived from a secret it never sees. These tests pin the parts
that make that true — the size cap, the id validation, the per-IP bucket, and
above all that the server treats the blob as bytes it may not interpret.
"""
from __future__ import annotations

import base64

import pytest

VALID_ID = "b" * 64
BLOB = base64.b64encode(b"iv-and-ciphertext-bytes").decode()


def test_push_then_pull_round_trips(client):
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": BLOB})
    assert r.status_code == 204

    r = client.post("/api/sync/pull", json={"blob_id": VALID_ID})
    assert r.status_code == 200
    assert r.json()["blob"] == BLOB
    assert r.json()["updated_at"]


def test_pull_unknown_id_is_404(client):
    r = client.post("/api/sync/pull", json={"blob_id": "c" * 64})
    assert r.status_code == 404


def test_delete_is_idempotent_and_removes(client):
    client.post("/api/sync/push", json={"blob_id": "d" * 64, "blob": BLOB})
    assert client.post("/api/sync/delete", json={"blob_id": "d" * 64}).status_code == 204
    assert client.post("/api/sync/pull", json={"blob_id": "d" * 64}).status_code == 404
    # Deleting again must not 500 — the user may retry an erase.
    assert client.post("/api/sync/delete", json={"blob_id": "d" * 64}).status_code == 204


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "xyz",
        "a" * 63,  # too short, right alphabet
        "a" * 65,  # too long, right alphabet
        "A" * 64,  # uppercase hex: one id must have exactly one spelling
        "g" * 64,  # right length, not hex
        "a" * 64 + "\n",  # trailing newline — `$` would accept this, fullmatch must not
        123,
        None,
    ],
)
def test_malformed_blob_id_is_400(client, bad):
    r = client.post("/api/sync/push", json={"blob_id": bad, "blob": BLOB})
    assert r.status_code == 400


@pytest.mark.parametrize(
    "bad_blob",
    [
        "not valid base64!!",  # outside the alphabet
        "aGVsbG8",  # truncated padding
        "",  # empty string
        None,  # field missing
        123,  # not a string
        base64.b64encode(b"").decode(),  # valid base64 of nothing
    ],
)
def test_malformed_blob_is_400(client, bad_blob):
    """A blob we cannot even decode is a client bug, not something to store: a
    silently-truncated blob would be accepted here and fail to decrypt forever
    after, which the user would experience as their progress being eaten."""
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": bad_blob})
    assert r.status_code == 400


def test_oversized_body_by_content_length_is_413(client):
    big = base64.b64encode(b"x" * 70_000).decode()
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": big})
    assert r.status_code == 413


def test_over_rate_limit_is_429(client):
    import config

    for _ in range(config.SYNC_RATE_LIMIT):
        client.post("/api/sync/pull", json={"blob_id": "e" * 64})
    r = client.post("/api/sync/pull", json={"blob_id": "e" * 64})
    assert r.status_code == 429
    assert r.headers.get("retry-after") == "60"


# ---------------------------------------------------------------------------
# The server half of the privacy contract: opacity.
#
# The plan (and spec §8) asked for a test that pushes a blob carrying a marker in
# its DECODED bytes and greps the DB file to prove the marker is absent. That
# test is not merely weak, it is inverted, and it was dropped rather than
# weakened. The server stores base64-decode(blob); a marker pushed as the blob's
# decoded bytes therefore IS in the DB *by construction*, and the only way to
# make the assertion pass is for the server to lose the user's data. It ran green
# against a server with no sync feature at all and went red the moment push
# started working correctly.
#
# The confusion underneath it is worth naming: "no plaintext in the DB" is not a
# server-side property and no server-side test can establish it. The blob is
# plaintext-free because the CLIENT encrypted it (Task 4's job) — the server
# cannot tell ciphertext from cleartext and has no key either way. What is
# genuinely pinnable here, and what the tests below pin, is that the server never
# acquires a reason to look: it does not interpret the bytes, it keeps no second
# copy of them, and it never writes the one identifier it does see to a log.
# ---------------------------------------------------------------------------

def test_blob_is_never_interpreted(client):
    """Real AES-GCM output is neither valid UTF-8 nor valid JSON. Bytes like that
    must round-trip untouched, which is what forbids the server from ever growing
    a parse/validate/normalise step it could then read something out of."""
    opaque = bytes(range(256))  # invalid UTF-8 and invalid JSON, like real ciphertext
    blob = base64.b64encode(opaque).decode()

    assert client.post(
        "/api/sync/push", json={"blob_id": "1" * 64, "blob": blob}
    ).status_code == 204

    r = client.post("/api/sync/pull", json={"blob_id": "1" * 64})
    assert r.status_code == 200
    assert base64.b64decode(r.json()["blob"]) == opaque, (
        "the server altered the ciphertext — it is treating the blob as something "
        "with a shape, and a blob with a shape is a blob someone can read"
    )


def test_payload_lives_only_in_the_ciphertext_column(client):
    """The DB holds the blob — that is what storage means. What must not exist is
    a SECOND, derived copy: an FTS index entry, an audit row, a decoded cache.
    Those are how a store that "cannot read" its data quietly starts to."""
    import sqlite3

    import config

    marker = b"MARKER-THAT-MUST-NOT-BE-COPIED-ANYWHERE"
    client.post(
        "/api/sync/push",
        json={"blob_id": "2" * 64, "blob": base64.b64encode(marker).decode()},
    )

    conn = sqlite3.connect(config.DATABASE_PATH)
    try:
        tables = [
            row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        ]
        holding = set()
        for table in tables:
            try:
                rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
            except sqlite3.DatabaseError:
                continue  # shadow tables that reject a bare SELECT
            for row in rows:
                cells = (v if isinstance(v, bytes) else str(v).encode() for v in row)
                if any(marker in cell for cell in cells):
                    holding.add(table)
                    break
    finally:
        conn.close()

    assert holding == {"sync_blob"}, (
        f"the payload was copied outside sync_blob.ciphertext (found in: {holding}). "
        "Every extra copy is a place the opacity guarantee has to be re-argued."
    )


def test_blob_id_never_reaches_the_logs(client, caplog):
    """Spec §3.3, and the reason all three endpoints are POSTs carrying the id in
    the BODY: blob_id is not secret but it is not public either — it grants read
    AND delete on the blob. A `/api/sync/pull/{blob_id}` route would look tidier
    and would print every user's capability into nginx's access log and ours.
    """
    import logging

    discammer_logger = logging.getLogger("discammer")
    discammer_logger.addHandler(caplog.handler)
    caplog.set_level(logging.INFO, logger="discammer")
    blob_id = "3" * 64
    try:
        client.post("/api/sync/push", json={"blob_id": blob_id, "blob": BLOB})
        client.post("/api/sync/pull", json={"blob_id": blob_id})
        client.post("/api/sync/delete", json={"blob_id": blob_id})
    finally:
        discammer_logger.removeHandler(caplog.handler)

    logged = [rec for rec in caplog.records if rec.name == "discammer"]
    assert logged, "the request logger should still be running — else this proves nothing"
    for rec in logged:
        assert blob_id not in rec.getMessage()
        for attr in vars(rec).values():
            assert blob_id not in str(attr), (
                "blob_id reached a log record; it grants read+delete on the blob"
            )
