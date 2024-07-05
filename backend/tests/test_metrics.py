"""O2 — RED (Rate/Errors/Duration) metrics endpoint.

Covers ``backend/metrics.py`` (dependency-free Prometheus text exposition) and
``GET /api/metrics`` in ``main.py``:
- the request middleware records each request once (route TEMPLATE label, not
  the raw slug path, to bound cardinality and avoid leaking content);
- counters increment across requests and the duration histogram populates;
- /api/metrics is access-gated: closed (404) when METRICS_TOKEN is unset for a
  non-local caller; 401 when a token is set but missing/wrong; 200 + valid
  exposition format with the right Bearer token;
- /api/metrics never counts itself (no self-feedback).
"""
from __future__ import annotations

import importlib


def test_collector_records_and_renders():
    import metrics

    collector = metrics.MetricsCollector()
    collector.observe(method="GET", route="/{lang}/", status=200, duration_s=0.012)
    collector.observe(method="GET", route="/{lang}/", status=200, duration_s=0.030)
    collector.observe(method="GET", route="/{lang}/journal/{slug}", status=500, duration_s=0.5)

    text = collector.render()
    # Prometheus exposition basics.
    assert "# HELP" in text
    assert "# TYPE" in text
    # Request counter, labelled by method/route/status_class.
    assert 'discammer_requests_total{' in text
    assert 'method="GET"' in text
    assert 'route="/{lang}/"' in text
    assert 'status_class="2xx"' in text
    # Two 2xx on /{lang}/ → count 2.
    assert _series_value(text, 'discammer_requests_total', method="GET", route="/{lang}/", status_class="2xx") == 2.0
    # Error counter increments on the 5xx.
    assert _series_value(text, 'discammer_errors_total', method="GET", route="/{lang}/journal/{slug}", status_class="5xx") == 1.0
    # Duration histogram buckets present (cumulative _bucket + _count + _sum).
    assert "discammer_request_duration_seconds_bucket{" in text
    assert "discammer_request_duration_seconds_count{" in text
    assert "discammer_request_duration_seconds_sum{" in text
    assert 'le="+Inf"' in text


def _series_value(text: str, metric: str, **labels) -> float:
    """Find a single sample line `metric{labels} value` and return the value.

    Labels may be a subset; the line must contain each `k="v"`.
    """
    for line in text.splitlines():
        if not line.startswith(metric + "{"):
            continue
        if all(f'{k}="{v}"' in line for k, v in labels.items()):
            return float(line.rsplit(" ", 1)[1])
    raise AssertionError(f"series not found: {metric} {labels}\n--- exposition ---\n{text}")


def test_metrics_closed_to_public_when_token_unset(client, monkeypatch):
    import main

    monkeypatch.setattr(main, "METRICS_TOKEN", "")
    r = client.get("/api/metrics")
    # Closed to the public: a non-local caller (TestClient) gets a 404 so the
    # endpoint isn't even advertised.
    assert r.status_code == 404


def test_metrics_requires_bearer_token_when_set(client, monkeypatch):
    import main

    monkeypatch.setattr(main, "METRICS_TOKEN", "s3cret")
    # Missing token → 401.
    assert client.get("/api/metrics").status_code == 401
    # Wrong token → 401.
    assert client.get("/api/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_metrics_exposition_with_token(client, monkeypatch):
    import main

    monkeypatch.setattr(main, "METRICS_TOKEN", "s3cret")
    # Generate some traffic so the counters are non-empty.
    client.get("/en/")
    client.get("/journal")

    r = client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200
    ctype = r.headers["content-type"]
    assert ctype.startswith("text/plain")
    assert "version=0.0.4" in ctype
    body = r.text
    assert "discammer_requests_total{" in body
    assert "discammer_request_duration_seconds_bucket{" in body


def test_metrics_does_not_count_itself(client, monkeypatch):
    import main

    monkeypatch.setattr(main, "METRICS_TOKEN", "s3cret")
    # Scrape twice; the metrics route must never appear as its own series.
    client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"})
    r = client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200
    assert "/api/metrics" not in r.text, "the metrics endpoint must not count itself"


def test_request_counter_increments_via_middleware(client, monkeypatch):
    import main

    monkeypatch.setattr(main, "METRICS_TOKEN", "s3cret")
    before = client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"}).text
    client.get("/en/")
    after = client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"}).text

    # The total number of recorded requests must have grown.
    def total_requests(text: str) -> float:
        s = 0.0
        for line in text.splitlines():
            if line.startswith("discammer_requests_total{"):
                s += float(line.rsplit(" ", 1)[1])
        return s

    assert total_requests(after) > total_requests(before)
