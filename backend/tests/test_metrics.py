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


def test_loopback_hosts_are_numeric_only(client, monkeypatch):
    """FIX 4: _LOOPBACK_HOSTS holds only numeric loopback peers. Name literals
    like 'localhost'/'testserver' could never match request.client.host (a
    numeric socket address) and have been removed. The TestClient peer
    ('testclient') is — and always was — outside the set, so a token-unset
    deployment stays closed (404) to it."""
    import main

    assert main._LOOPBACK_HOSTS == {"127.0.0.1", "::1"}
    monkeypatch.setattr(main, "METRICS_TOKEN", "")
    assert client.get("/api/metrics").status_code == 404


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


# ---------------------------------------------------------------------------
# AN-1 — privacy-first product-usage surface counter.
#
# A second, PII-free series `discammer_surface_views_total{surface,lang}` records
# WHICH server-rendered surface (home/journal/post/guide/course/module/lesson/
# game/about/portfolio/tools_check/tools_inspect/search) a reader loaded, keyed
# only by the coarse surface name and the UI language. It NEVER carries a slug,
# path, query string, request body, IP, or any user content — the checker/
# inspector are counted by surface NAME only and their text never reaches the
# server. Cardinality is ~13 surfaces × 2 langs.
# ---------------------------------------------------------------------------

_SURFACE = "discammer_surface_views_total"


def _surface_lines(text: str) -> list[str]:
    """Just the surface-views sample lines from a full exposition."""
    return [ln for ln in text.splitlines() if ln.startswith(_SURFACE + "{")]


def _surface_value(text: str, surface: str, lang: str) -> float:
    """Value of `discammer_surface_views_total{surface=..,lang=..}` (0 if absent)."""
    for line in _surface_lines(text):
        if f'surface="{surface}"' in line and f'lang="{lang}"' in line:
            return float(line.rsplit(" ", 1)[1])
    return 0.0


def _surface_total(text: str) -> float:
    """Sum of every surface-views sample (across all surface/lang pairs)."""
    return sum(float(ln.rsplit(" ", 1)[1]) for ln in _surface_lines(text))


def test_surface_view_records_guide_en(client):
    """A GET of a guide page increments surface="guide",lang="en" by 1."""
    from metrics import collector

    before = _surface_value(collector.render(), "guide", "en")
    assert client.get("/en/guide/phishing").status_code == 200
    text = collector.render()
    assert _surface_value(text, "guide", "en") == before + 1.0
    # Exact label shape (surface first, then lang) is present.
    assert f'{_SURFACE}{{surface="guide",lang="en"}}' in text


def test_surface_view_records_game_ru(client):
    """`/ru/game` increments surface="game",lang="ru"."""
    from metrics import collector

    before = _surface_value(collector.render(), "game", "ru")
    assert client.get("/ru/game").status_code == 200
    assert _surface_value(collector.render(), "game", "ru") == before + 1.0


def test_non_page_get_does_not_increment_surface(client):
    """Non-page GETs (a JSON API endpoint, a static asset) add NOTHING to the
    surface counter — only server-rendered HTML page surfaces are counted."""
    from metrics import collector

    before = _surface_total(collector.render())
    # A 2xx JSON API response — not HTML, not a page surface.
    assert client.get("/api/posts").status_code == 200
    # A 2xx static asset — not HTML, route is the /static mount, not a surface.
    assert client.get("/static/.vite/manifest.json").status_code == 200
    assert _surface_total(collector.render()) == before


def test_surface_views_never_leak_a_slug(client):
    """PII guard: after visiting a guide and a journal post, the surface-views
    lines carry the COARSE surface name only — never the slug."""
    from metrics import collector

    assert client.get("/en/guide/phishing").status_code == 200
    assert client.get("/en/journal/the-story-of-alex-chen").status_code == 200

    blob = "\n".join(_surface_lines(collector.render()))
    # Slugs must NOT appear anywhere in the surface series.
    assert "phishing" not in blob
    assert "the-story-of-alex-chen" not in blob
    assert "alex-chen" not in blob
    # The coarse surface names are what got recorded instead.
    assert 'surface="guide"' in blob
    assert 'surface="post"' in blob


def test_collector_observe_surface_counts_and_escapes():
    """Unit test on MetricsCollector: two observations → count 2, HELP/TYPE
    present, and label values are escaped per the Prometheus text format."""
    import metrics

    collector = metrics.MetricsCollector()
    collector.observe_surface(surface="guide", lang="en")
    collector.observe_surface(surface="guide", lang="en")

    text = collector.render()
    assert f"# HELP {_SURFACE}" in text
    assert f"# TYPE {_SURFACE} counter" in text
    assert _series_value(text, _SURFACE, surface="guide", lang="en") == 2.0

    # Label escaping intact (a smuggled quote/backslash is escaped, not raw).
    collector.observe_surface(surface='a"b\\c', lang="en")
    assert 'surface="a\\"b\\\\c"' in collector.render()
