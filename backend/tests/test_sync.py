"""UX-4 · sync endpoint contract.

The server is assumed hostile in this design: it stores an opaque client-encrypted
blob under an id derived from a secret it never sees. These tests pin the parts
that make that true — the size cap, the id validation, the per-IP bucket, and
above all that the server treats the blob as bytes it may not interpret.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib

import pytest


def blob_id(tag: str) -> str:
    """A distinct, realistically-shaped blob_id per call site.

    The whole suite shares one session-scoped DB, so tests that reuse a literal
    id couple through the store and stay green only while pytest happens to
    collect them in a lucky order. This file was already walking into that trap:
    it claimed "1"*64, "2"*64 and "3"*64, which are exactly the ids the sweep
    tests write with INSERT OR REPLACE — and the only thing keeping them apart
    was that "test_sync.py" sorts before "test_sync_sweep.py". Deriving each id
    from a tag removes the need for that coordination entirely.

    A sha256 digest is also exactly the shape of a real blob_id — 64 lowercase
    hex characters, the hex of HKDF's 32-byte 'id' output. A run of one repeated
    character is a legal id but not a representative one.
    """
    return hashlib.sha256(tag.encode()).hexdigest()


VALID_ID = blob_id("valid")
BLOB = base64.b64encode(b"iv-and-ciphertext-bytes").decode()


def test_push_then_pull_round_trips(client):
    r = client.post("/api/sync/push", json={"blob_id": VALID_ID, "blob": BLOB})
    assert r.status_code == 204

    r = client.post("/api/sync/pull", json={"blob_id": VALID_ID})
    assert r.status_code == 200
    assert r.json()["blob"] == BLOB
    assert r.json()["updated_at"]
    # no-store, and specifically NOT no-cache. Deleting the handler's header
    # looks inert but is not: the catch-all in request_logging_middleware stamps
    # `no-cache` on any response that arrives without a Cache-Control, and
    # `no-cache` means "store it, but revalidate". That would make the ciphertext
    # storable in any shared cache — the exact outcome the header exists to
    # prevent, reached by deleting one line and breaking no test.
    assert r.headers["cache-control"] == "no-store"


def test_pull_unknown_id_is_404(client):
    """A well-formed id we never pushed is a 404 — from the handler, not the router.

    The status assertion alone is vacuous: FastAPI answers ANY unregistered path
    with 404, so `assert 404` passed before this feature existed and would pass
    again if the route were deleted. The second assertion is the liveness
    witness — a malformed id on the same path is a 400, and only a live handler
    can tell those two apart. A missing route would answer 404 to both.
    """
    assert (
        client.post("/api/sync/pull", json={"blob_id": blob_id("never-pushed")}).status_code
        == 404
    )
    assert client.post("/api/sync/pull", json={"blob_id": "nope"}).status_code == 400


def test_delete_is_idempotent_and_removes(client):
    doomed = blob_id("delete")
    client.post("/api/sync/push", json={"blob_id": doomed, "blob": BLOB})
    assert client.post("/api/sync/delete", json={"blob_id": doomed}).status_code == 204
    assert client.post("/api/sync/pull", json={"blob_id": doomed}).status_code == 404
    # Deleting again must not 500 — the user may retry an erase.
    assert client.post("/api/sync/delete", json={"blob_id": doomed}).status_code == 204


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
        # The case that actually exercises validate=True, and the only one here
        # that does. Its length is a clean multiple of 4, so padding is happy;
        # the junk is INSIDE. base64.b64decode("aGVsbG8h!!!!") without
        # validate=True silently discards the "!"s and returns b"hello!" — a
        # short, wrong, cheerfully-stored blob that can never decrypt again.
        # Every other param below dies on padding, which happens identically with
        # validate=False, so without this one the flag could be deleted and this
        # whole parametrize would stay green.
        "aGVsbG8h!!!!",
        "not valid base64!!",  # junk outside the alphabet (rejected on padding)
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


def test_oversized_body_by_streaming_cap_is_refused():
    """Spec §8 asks for 413 "и по Content-Length, и потоком без него" — both by
    Content-Length and streamed without it. The test above is only the first half.

    The second half cannot be driven through `client`: httpx always sends an
    honest Content-Length, so every request it makes hits the early-out and the
    streaming cap is never reached (test_client_errors.py records the same
    limitation for the beacon). That is precisely the wrong half to leave
    uncovered — the cap exists for the case where Content-Length is absent or
    lies, which is the only case where a body could actually be unbounded. So
    this drives _read_capped_sync_body directly, through a real Starlette
    Request over a chunked receive channel carrying no Content-Length at all.

    asyncio.run in a sync test is this project's async idiom (test_db_lifecycle.py);
    pytest-asyncio is not installed.
    """
    import config
    import main
    from starlette.requests import Request

    chunk = b"x" * 16_384
    chunks = [chunk] * (config.SYNC_MAX_BODY // len(chunk) + 2)
    sent = iter(chunks)

    async def receive():
        try:
            return {"type": "http.request", "body": next(sent), "more_body": True}
        except StopIteration:
            return {"type": "http.request", "body": b"", "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/sync/push",
            "headers": [(b"content-type", b"application/json")],
            "query_string": b"",
        },
        receive,
    )
    assert request.headers.get("content-length") is None, (
        "the whole point of this test is the absent Content-Length"
    )

    assert asyncio.run(main._read_capped_sync_body(request)) is None, (
        "a body with no Content-Length must still be refused once it crosses the "
        "cap — without the in-loop check the handler buffers whatever it is fed"
    )


def test_over_rate_limit_is_429(client):
    import config

    flooded = blob_id("rate-limit")
    for _ in range(config.SYNC_RATE_LIMIT):
        client.post("/api/sync/pull", json={"blob_id": flooded})
    r = client.post("/api/sync/pull", json={"blob_id": flooded})
    assert r.status_code == 429
    assert r.headers.get("retry-after") == "60"


def test_sync_paths_are_exempt_from_the_general_api_limiter(client):
    """The sync paths carry their own stricter bucket (20/min against the general
    240/min), and are exempt from the general one so a push is not billed twice.

    Nothing pinned that: with the exempt entries removed the suite stays green,
    because _sync_limiter 429s at 20 long before the 240/min bucket bites. The
    two limiters would silently stack, and a user's sync budget would quietly
    become whatever the general limiter had left over after page loads.
    Installing a near-zero general limiter makes the stacking observable — the
    idiom test_security_headers.py already uses for /api/health.
    """
    import main
    from ratelimit import RateLimiter

    unknown = blob_id("exempt")
    original = main._api_limiter
    main._api_limiter = RateLimiter(1)  # a 2nd non-exempt /api/ request would 429
    try:
        statuses = [
            client.post("/api/sync/pull", json={"blob_id": unknown}).status_code
            for _ in range(3)
        ]
    finally:
        main._api_limiter = original

    assert statuses == [404, 404, 404], (
        "the general limiter throttled a sync path: it must stay in "
        f"_API_RATE_LIMIT_EXEMPT or every sync call is billed to two buckets "
        f"(got {statuses})"
    )


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
    bid = blob_id("opaque")

    assert client.post(
        "/api/sync/push", json={"blob_id": bid, "blob": blob}
    ).status_code == 204

    r = client.post("/api/sync/pull", json={"blob_id": bid})
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
        json={"blob_id": blob_id("marker"), "blob": base64.b64encode(marker).decode()},
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
    bid = blob_id("logs")
    try:
        client.post("/api/sync/push", json={"blob_id": bid, "blob": BLOB})
        client.post("/api/sync/pull", json={"blob_id": bid})
        client.post("/api/sync/delete", json={"blob_id": bid})
    finally:
        discammer_logger.removeHandler(caplog.handler)

    logged = [rec for rec in caplog.records if rec.name == "discammer"]
    assert logged, "the request logger should still be running — else this proves nothing"
    for rec in logged:
        assert bid not in rec.getMessage()
        for attr in vars(rec).values():
            assert bid not in str(attr), (
                "blob_id reached a log record; it grants read+delete on the blob"
            )
