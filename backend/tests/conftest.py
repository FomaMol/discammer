"""Shared test fixtures.

Tests run against a temporary SQLite DB so they don't pollute the real one.
The override is plugged in by patching ``config.DATABASE_PATH`` before the
FastAPI app is imported.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pytest

# Ensure backend/ is on sys.path the same way main.py does it.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


@pytest.fixture(scope="session")
def app():
    """Build the FastAPI app against a temp DB and run lifespan once.

    Yields the imported FastAPI instance after seed_database() has populated
    a throwaway SQLite file with the real markdown content.
    """
    tmp_dir = Path(tempfile.mkdtemp(prefix="discammer-tests-"))

    import config  # noqa: E402

    config.DATA_DIR = tmp_dir
    config.DATABASE_PATH = tmp_dir / "discammer.db"

    # Reload modules that captured DATABASE_PATH at import time.
    import importlib

    import database  # noqa: E402

    importlib.reload(database)

    # Now build the app.
    import main  # noqa: E402

    importlib.reload(main)
    return main.app


@pytest.fixture(scope="session")
def client(app):
    """TestClient with lifespan context (runs init_db + seed_database)."""
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c
