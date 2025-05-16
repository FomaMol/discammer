"""DB lifecycle tests for A3 (one connection per request) and A4 (seed lock).

A3 verifies the ``get_conn`` request dependency opens exactly one aiosqlite
connection per request even when a route fans out across several CRUD helpers
(the home page makes four helper calls; ``/api/posts`` makes one).

A4 verifies the ``fcntl.flock`` guard in ``seed_database`` lets two concurrent
seeds serialize without corruption and leaves the content tables populated.

UX-4 adds the ``sync_blob`` survival invariant: the project has two destructive
startup paths, both hardcoded allowlists over the four derived CONTENT tables,
and ``sync_blob`` is protected only by its ABSENCE from them. Absence is not
self-documenting and a future refactor can undo it silently, so both paths are
pinned by a test rather than by a comment.

The two paths need different techniques, and the difference is the whole point:

* The seed wipe is pinned BEHAVIOURALLY. ``DELETE FROM`` over the content tables
  runs on every startup, so putting sync_blob on that list destroys the blob on
  the very next boot — a test that reseeds and re-reads the blob catches it.
* The drift DROP is pinned STRUCTURALLY, by reading ``_DRIFT_CHECKED_TABLES``.
  It cannot be pinned behaviourally: drifting a content table drops that table
  and no other, so sync_blob survives that experiment whether or not it is on
  the list. Adding it there is inert today and only fires later, on the next
  sync_blob schema change. A behavioural test would sit green through the entire
  window in which the mistake was still cheap to fix.
"""
from __future__ import annotations

import asyncio
import sqlite3
import threading

import aiosqlite
import pytest

import config
import database
import seed_data


# ---------------------------------------------------------------------------
# A3 — one connection per request
# ---------------------------------------------------------------------------

class _ConnCounter:
    """Wraps ``aiosqlite.connect`` and counts how many times it is called."""

    def __init__(self, real):
        self._real = real
        self.count = 0

    def reset(self):
        self.count = 0

    def __call__(self, *args, **kwargs):
        self.count += 1
        return self._real(*args, **kwargs)


def _measure_request(client, monkeypatch, path: str) -> int:
    """Return the number of aiosqlite connections opened serving ``path``.

    The dependency calls ``aiosqlite.connect`` via the name bound inside
    ``database``; patching there intercepts exactly the per-request connection
    without touching startup seeding (which already ran).
    """
    counter = _ConnCounter(aiosqlite.connect)
    monkeypatch.setattr(database.aiosqlite, "connect", counter)
    counter.reset()
    resp = client.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}"
    return counter.count


def test_home_opens_one_connection(client, monkeypatch):
    # The home page calls get_posts x3 + get_guides — four CRUD helpers that, in
    # the old per-call model, opened four connections. With get_conn it's one.
    assert _measure_request(client, monkeypatch, "/en/") == 1


def test_api_posts_opens_one_connection(client, monkeypatch):
    assert _measure_request(client, monkeypatch, "/api/posts") == 1


# ---------------------------------------------------------------------------
# A4 — concurrent seeds serialize via the flock guard
# ---------------------------------------------------------------------------

@pytest.fixture()
def temp_seed_db(tmp_path, monkeypatch):
    """Point config at a throwaway DB dir and create the schema.

    Mirrors conftest's swap of ``config.DATA_DIR`` / ``config.DATABASE_PATH``
    but scoped to a single test so the concurrent-seed run can't disturb the
    session-wide client DB.
    """
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DATABASE_PATH", tmp_path / "discammer.db")
    monkeypatch.setattr(config, "SEED_ON_STARTUP", True)
    asyncio.run(database.init_db())
    return tmp_path


def _count(db_path, table: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def test_concurrent_seeds_serialize(temp_seed_db):
    db_path = config.DATABASE_PATH
    errors: list[BaseException] = []

    def run_seed():
        try:
            asyncio.run(seed_data.seed_database())
        except BaseException as exc:  # noqa: BLE001 — surface to the assertion
            errors.append(exc)

    threads = [threading.Thread(target=run_seed) for _ in range(2)]
    for thr in threads:
        thr.start()
    for thr in threads:
        thr.join()

    assert not errors, f"concurrent seeds raised: {errors!r}"
    # Both seeds wipe then reinsert; the flock guarantees they don't interleave,
    # so the final state is exactly one full seed regardless of which ran last.
    assert _count(db_path, "post") > 0
    assert _count(db_path, "scam_guide") > 0
    assert _count(db_path, "course_module") > 0


def test_seed_on_startup_off_skips_wipe(temp_seed_db, monkeypatch):
    # Prime the DB with a full seed, then a disabled reseed must leave it intact.
    asyncio.run(seed_data.seed_database())
    seeded = _count(config.DATABASE_PATH, "course_module")
    assert seeded > 0

    # monkeypatch restores SEED_ON_STARTUP after the test.
    monkeypatch.setattr(config, "SEED_ON_STARTUP", False)
    asyncio.run(seed_data.seed_database())

    assert _count(config.DATABASE_PATH, "course_module") == seeded


# ---------------------------------------------------------------------------
# UX-4 — sync_blob survives both destructive startup paths
# ---------------------------------------------------------------------------

_BLOB_ID = "a" * 64
_CIPHERTEXT = b"opaque-ciphertext"


def _insert_blob(db_path, blob_id: str = _BLOB_ID) -> None:
    """Write a sync blob with the sync module absent — this is a schema test."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sync_blob"
            " (blob_id, ciphertext, updated_at, last_seen_at) VALUES (?, ?, ?, ?)",
            (blob_id, _CIPHERTEXT, "2026-07-15T00:00:00+00:00", "2026-07-15T00:00:00+00:00"),
        )
        conn.commit()
    finally:
        conn.close()


def _fetch_blob(db_path, blob_id: str = _BLOB_ID):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(
            "SELECT ciphertext FROM sync_blob WHERE blob_id = ?", (blob_id,)
        ).fetchone()
    finally:
        conn.close()


def test_reseed_does_not_touch_sync_blob(temp_seed_db):
    """UX-4 invariant: sync_blob holds durable USER state, so the startup
    wipe+reseed of derived content tables must never touch it. This is the
    promise seed_database()'s own docstring already makes; this test is what
    makes it real rather than aspirational."""
    _insert_blob(config.DATABASE_PATH)

    asyncio.run(seed_data.seed_database())

    # Guard the guard: if the seed silently no-opped, a surviving blob would
    # prove nothing. Assert the wipe+reseed actually ran.
    assert _count(config.DATABASE_PATH, "course_module") > 0

    row = _fetch_blob(config.DATABASE_PATH)
    assert row is not None, "reseed wiped user state — the seed DELETE allowlist leaked"
    assert row[0] == _CIPHERTEXT


def test_sync_blob_is_not_a_drift_checked_table():
    """The invariant the drift path actually turns on: membership in the loop's
    table list.

    This is a structural assertion on purpose. No end-to-end drift test can pin
    this invariant, because drifting a CONTENT table can never reach sync_blob —
    SQLite drops the table you name and no other, so `DROP TABLE post` leaves
    sync_blob standing whether or not sync_blob is in the loop. The dangerous
    mutation (adding sync_blob with the columns it really has) is a NO-OP today
    and only detonates later, when someone adds a column to sync_blob's schema
    and the live DB's older column set fails `issubset` — DROP TABLE sync_blob,
    every user's progress gone, suite green the whole way. Reading the list is
    the only thing that catches that while it is still harmless.
    """
    checked = {name for name, _ in database._DRIFT_CHECKED_TABLES}
    assert "sync_blob" not in checked, (
        "sync_blob entered init_db's drift-DROP loop. It is durable USER state "
        "rebuilt from nothing; the next column added to its schema would DROP "
        "the table and destroy every linked user's progress. Schema changes here "
        "need a migration, not the content tables' drop-and-reseed strategy."
    )


def test_drift_checked_tables_is_init_db_s_live_control_surface(temp_seed_db, monkeypatch):
    """Guard the guard: the structural test above is worth exactly nothing if
    init_db stops reading _DRIFT_CHECKED_TABLES (say, a refactor re-inlines the
    tuple and leaves the constant behind as decoration). Empty the constant and
    the drift it would otherwise repair must survive — proving the constant
    drives the loop rather than describing it.
    """
    conn = sqlite3.connect(config.DATABASE_PATH)
    try:
        conn.execute("DROP TABLE post")
        conn.execute("CREATE TABLE post (id INTEGER PRIMARY KEY, slug TEXT)")
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setattr(database, "_DRIFT_CHECKED_TABLES", ())
    asyncio.run(database.init_db())

    conn = sqlite3.connect(config.DATABASE_PATH)
    try:
        post_cols = {row[1] for row in conn.execute("PRAGMA table_info(post)")}
    finally:
        conn.close()
    assert "title" not in post_cols, (
        "init_db repaired drift with an EMPTY _DRIFT_CHECKED_TABLES, so it reads "
        "some other list — asserting on that constant proves nothing about what "
        "the drop loop will actually touch"
    )


def test_column_drift_drop_does_not_touch_sync_blob(temp_seed_db):
    """End-to-end companion to the structural test above: with the real table
    list, drift on a content table fires the DROP path and sync_blob comes
    through intact.

    Deliberately modest about what this proves. SQLite would leave sync_blob
    standing here even if sync_blob WERE in the loop, so this cannot pin the
    exclusion — test_sync_blob_is_not_a_drift_checked_table does that. What this
    adds is that the drift path really runs (see the `title` guard) and that a
    blob survives a real init_db repair rather than, say, an executescript that
    recreates the world.
    """
    _insert_blob(config.DATABASE_PATH)

    # Force real drift: rebuild `post` missing the required columns so the
    # drop-loop actually fires. Without this the test would pass vacuously.
    conn = sqlite3.connect(config.DATABASE_PATH)
    try:
        conn.execute("DROP TABLE post")
        conn.execute("CREATE TABLE post (id INTEGER PRIMARY KEY, slug TEXT)")
        conn.commit()
    finally:
        conn.close()

    asyncio.run(database.init_db())

    conn = sqlite3.connect(config.DATABASE_PATH)
    try:
        post_cols = {row[1] for row in conn.execute("PRAGMA table_info(post)")}
    finally:
        conn.close()
    assert "title" in post_cols, "drift path did not fire — the test proved nothing"

    row = _fetch_blob(config.DATABASE_PATH)
    assert row is not None, "drift DROP reached sync_blob — user state is not drop-safe"
    assert row[0] == _CIPHERTEXT
