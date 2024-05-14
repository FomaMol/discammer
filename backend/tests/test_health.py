"""O2 — /api/health endpoint.

The health probe returns 200 with the seeded row counts when the DB is
reachable. (The 503-on-DB-failure path is exercised by construction — the
endpoint opens its connection inside a try/except and returns a 503
JSONResponse on any exception — but isn't simulated here to avoid corrupting
the session-wide seeded DB shared by the other tests.)
"""
from __future__ import annotations


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")

    data = r.json()
    assert set(data.keys()) == {"status", "version", "db", "posts", "guides", "modules"}
    assert data["status"] == "ok"
    assert data["db"] == "ok"
    assert data["posts"] > 0
    assert data["guides"] > 0
    assert data["modules"] > 0


def test_health_version_present(client):
    # Defaults to "dev" locally; the deploy pipeline injects the short git SHA.
    data = client.get("/api/health").json()
    assert isinstance(data["version"], str)
    assert data["version"]
