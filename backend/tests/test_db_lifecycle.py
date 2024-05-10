"""DB lifecycle tests for A3 (one connection per request) and A4 (seed lock).

A3 verifies the ``get_conn`` request dependency opens exactly one aiosqlite
connection per request even when a route fans out across several CRUD helpers
(the home page makes four helper calls; ``/api/posts`` makes one).

A4 verifies the ``fcntl.flock`` guard in ``seed_database`` lets two concurrent
seeds serialize without corruption and leaves the content tables populated.
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
