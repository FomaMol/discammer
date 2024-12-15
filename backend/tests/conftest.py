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


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Isolate the in-memory per-IP limiters between tests so the general
    /api/* limiter (and the CSP-report sink) can't bleed accumulated counts from
    one test into another — the TestClient reuses 'testclient' as the peer IP.
    The client-error beacon limiter has its own reset in test_client_errors."""
    import main

    for name in ("_api_limiter", "_csp_report_limiter", "_client_error_limiter"):
        lim = getattr(main, name, None)
        if lim is not None:
            lim.clear()
    yield
