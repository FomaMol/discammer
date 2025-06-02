"""UX-4 · TTL sweep. Owner decision 2026-07-15: 12 months, refreshed on access.

Why a sweep exists at all: the design deliberately holds no email, no account and
no plaintext, so the server cannot ask "is this user still around?" — an
abandoned blob is indistinguishable from a dormant one. Data minimisation
therefore has to be time-based: a blob nobody has touched for a year ages out on
its own rather than sitting on a 2 GB VPS forever.

The other half of that bargain is the one an active user cares about, and it is
the more dangerous half to get wrong: every access renews the lease, so using
the product is what keeps the data alive. A sweep that silently ate a live
user's progress would be a data-loss bug reported months after the mistake
landed, by someone with no way to recover it. Hence both directions are pinned
here — what the sweep removes AND what it must never remove.

Idiom note: this project runs async code from sync tests via ``asyncio.run``
(see test_db_lifecycle.py). There is no pytest-asyncio in the dependency set and
this file does not add one.
"""
from __future__ import annotations

import asyncio
import base64
import time

import aiosqlite

import config
import database


def _insert_blob(blob_id: str, ciphertext: bytes, last_seen_at: str) -> None:
    """Plant a blob with a chosen lease age, bypassing the endpoints."""

    async def _run() -> None:
        async with aiosqlite.connect(config.DATABASE_PATH) as db:
            await db.execute(
                "INSERT OR REPLACE INTO sync_blob"
                " (blob_id, ciphertext, updated_at, last_seen_at)"
                " VALUES (?, ?, ?, ?)",
                (blob_id, ciphertext, last_seen_at, last_seen_at),
            )
            await db.commit()

    asyncio.run(_run())


def _backdate_lease(blob_id: str, last_seen_at: str) -> None:
    """Age the lease of a blob that must ALREADY exist.

    Deliberately an UPDATE, unlike _insert_blob's INSERT OR REPLACE: a caller
    that arranged the row through the push endpoint is making a claim about
    push, and a helper that conjures the row on demand would let that claim
    rot silently. Here the arrangement fails loudly instead.
    """

    async def _run() -> None:
        async with aiosqlite.connect(config.DATABASE_PATH) as db:
            cursor = await db.execute(
                "UPDATE sync_blob SET last_seen_at = ? WHERE blob_id = ?",
                (last_seen_at, blob_id),
            )
            await db.commit()
            assert cursor.rowcount == 1, (
                "no blob to backdate — the push this test depends on did not "
                "create the row"
            )

    asyncio.run(_run())


def _last_seen(blob_id: str) -> str | None:
    async def _run() -> str | None:
        async with aiosqlite.connect(config.DATABASE_PATH) as db:
            cursor = await db.execute(
                "SELECT last_seen_at FROM sync_blob WHERE blob_id = ?", (blob_id,)
            )
            row = await cursor.fetchone()
            return None if row is None else row[0]

    return asyncio.run(_run())


def test_sweep_removes_stale_keeps_fresh(client):
    """The sweep must discriminate by lease age, not just empty the table.

    The fresh blob's lease is minted from ``_utc_now_iso()`` rather than a
    literal date: a hardcoded "today" would quietly pass until it drifted past
    the TTL horizon and then fail for a reason that has nothing to do with the
    sweep.
    """
    _insert_blob("1" * 64, b"stale", "2020-01-01T00:00:00+00:00")
    _insert_blob("2" * 64, b"fresh", database._utc_now_iso())

    removed = asyncio.run(database.sync_sweep(config.SYNC_BLOB_TTL_DAYS))

    assert removed >= 1
    assert _last_seen("1" * 64) is None, "stale blob survived the sweep"
    assert _last_seen("2" * 64) is not None, "sweep ate a blob inside its TTL"


def test_sweep_keeps_a_blob_one_day_short_of_the_ttl(client):
    """Pin the boundary, not just the extremes.

    A sweep that is off by a sign, or that compares against the wrong end of the
    window, still passes a stale-vs-brand-new test. The interesting blob is the
    one that is nearly expired and must nonetheless survive, because that is the
    user who opens the course after eleven months away.
    """
    from datetime import datetime, timedelta, timezone

    almost = (
        datetime.now(timezone.utc) - timedelta(days=config.SYNC_BLOB_TTL_DAYS - 1)
    ).isoformat(timespec="seconds")
    _insert_blob("4" * 64, b"almost-expired", almost)

    asyncio.run(database.sync_sweep(config.SYNC_BLOB_TTL_DAYS))

    assert _last_seen("4" * 64) is not None, "sweep expired a blob a day early"


def test_pull_refreshes_ttl(client):
    """An active user must never age out: every access extends the lease.

    Scope, stated plainly: the refresh this pins lives in sync_get and shipped
    with the endpoints, not with the sweep — this test passes against the tree
    from before the sweep existed. It is here as a regression pin, because the
    sweep is what gives that refresh teeth: the lease became load-bearing the
    day something started deleting rows by it. It is not evidence the sweep was
    test-driven.

    The push is deliberately the thing that creates the row, and _backdate_lease
    refuses to invent one, so this exercises the round trip its name promises
    rather than a row planted behind the endpoints' backs.
    """
    blob_id = "3" * 64
    assert (
        client.post(
            "/api/sync/push",
            json={"blob_id": blob_id, "blob": base64.b64encode(b"x").decode()},
        ).status_code
        == 204
    )

    # Backdate the lease so a successful pull has something to refresh.
    _backdate_lease(blob_id, "2020-01-01T00:00:00+00:00")

    assert client.post("/api/sync/pull", json={"blob_id": blob_id}).status_code == 200

    last_seen = _last_seen(blob_id)
    assert last_seen is not None
    assert not last_seen.startswith("2020"), "pull must refresh the lease"


def test_sweep_is_gated_to_once_per_interval(client):
    """The push path must not sweep on every write.

    Sweeping per-push is write amplification against the one table holding user
    data; sweeping only at startup never fires on a long-lived process. The gate
    is what makes both false, so it is pinned here rather than left to the
    comment that explains it.
    """
    import main

    calls: list[int] = []

    async def _counting_sweep(ttl_days: int) -> int:
        calls.append(ttl_days)
        return 0

    original = main.sync_sweep
    original_last = main._sync_last_sweep
    main.sync_sweep = _counting_sweep
    main._sync_last_sweep = None  # "never swept in this process"
    try:
        asyncio.run(main._sync_sweep_if_due())
        asyncio.run(main._sync_sweep_if_due())
    finally:
        main.sync_sweep = original
        main._sync_last_sweep = original_last

    assert calls == [config.SYNC_BLOB_TTL_DAYS], (
        "expected exactly one sweep per interval, got %d" % len(calls)
    )


def test_sweep_fires_again_once_the_interval_has_elapsed(client):
    """The gate must be a clock, not a latch.

    Its sibling above pins "at most once per interval" — which a gate that fires
    once and then never again satisfies perfectly. That mutant is the exact
    failure the gate exists to prevent (the startup-only sweep on a process that
    stays up for months), so "at least once per interval" has to be pinned too,
    or the two halves of the gate are only half tested.

    ONE_DAY_SEC is deliberately a literal rather than main._SYNC_SWEEP_INTERVAL_SEC:
    the requirement is "sweep about daily", and a test that derives its clock from
    the constant it is checking would follow that constant anywhere — to 1e12 —
    and still pass.
    """
    import main

    ONE_DAY_SEC = 86400.0
    calls: list[int] = []

    async def _counting_sweep(ttl_days: int) -> int:
        calls.append(ttl_days)
        return 0

    original = main.sync_sweep
    original_last = main._sync_last_sweep
    main.sync_sweep = _counting_sweep
    # A day and a second since the last sweep: due by any reading of "daily".
    main._sync_last_sweep = time.monotonic() - ONE_DAY_SEC - 1
    try:
        asyncio.run(main._sync_sweep_if_due())
    finally:
        main.sync_sweep = original
        main._sync_last_sweep = original_last

    assert calls == [config.SYNC_BLOB_TTL_DAYS], (
        "a day has passed and the sweep did not fire — the gate is a latch, or "
        "the interval is no longer daily"
    )


def test_a_failing_sweep_does_not_fail_the_users_push(client):
    """Housekeeping must never fail a user write.

    The sweep is a passenger on the push path, not part of it: by the time it
    runs, sync_put has already committed the blob. If a sweep error escaped, a
    push that fully succeeded would surface to the client as a failure, and
    pushProgress would map it to 'error' — telling someone their progress did not
    save while it sits safely in the table. The DB is the one place that error is
    plausible (a 'database is locked' after the 5s busy_timeout under multi-worker
    contention), which is to say: once a day, on the write path, for real users.
    """
    import main

    async def _failing_sweep(ttl_days: int) -> int:
        raise RuntimeError("database is locked")

    blob_id = "5" * 64
    original = main.sync_sweep
    original_last = main._sync_last_sweep
    main.sync_sweep = _failing_sweep
    main._sync_last_sweep = None  # force the gate open so the sweep really runs
    try:
        response = client.post(
            "/api/sync/push",
            json={"blob_id": blob_id, "blob": base64.b64encode(b"kept").decode()},
        )
    finally:
        main.sync_sweep = original
        main._sync_last_sweep = original_last

    assert response.status_code == 204, (
        "a sweep failure turned a stored push into an error — the user is told "
        "sync failed while their blob is on disk"
    )
    assert _last_seen(blob_id) is not None, "the push should have persisted"
