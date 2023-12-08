"""Shared test fixtures.

Tests run against a temporary SQLite DB so they don't pollute the real one.
``database.py`` and ``seed_data.py`` look up ``config.DATABASE_PATH`` at call
time, so the fixture only needs to swap the attribute on the ``config`` module
before the lifespan hook runs — no module reloads required.
"""
from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def app(tmp_path_factory):
    """Build the FastAPI app against a temp DB and run lifespan once.

    Yields the imported FastAPI instance after seed_database() has populated
    a throwaway SQLite file with the real markdown content.
    """
    tmp_dir = tmp_path_factory.mktemp("discammer-db")

    import config

    config.DATA_DIR = tmp_dir
    config.DATABASE_PATH = tmp_dir / "discammer.db"

    import main

    return main.app


@pytest.fixture(scope="session")
def client(app):
    """TestClient with lifespan context (runs init_db + seed_database)."""
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c
