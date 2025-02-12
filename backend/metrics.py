"""O2 — RED (Rate / Errors / Duration) metrics.

A tiny, dependency-free Prometheus *text exposition* collector. Fed once per
request from the existing request-logging middleware in ``main.py`` (it is NOT
a second middleware). Exposes three series:

  * ``discammer_requests_total`` — counter by {method, route, status_class}
  * ``discammer_errors_total``   — counter by {method, route, status_class}
    (only 5xx; cheap to query "are we erroring?")
  * ``discammer_request_duration_seconds`` — a fixed-bucket histogram
    (``_bucket`` / ``_sum`` / ``_count``).
  * ``discammer_surface_views_total`` — AN-1 product-usage counter by
    {surface, lang}: WHICH server-rendered surface a reader loaded, keyed only
    by a coarse surface name and UI language. Never a slug/path/query/body/IP or
    any user content (the checker/inspector are counted by surface name only).

Cardinality control: the ``route`` label is always a route *template* (e.g.
``/{lang}/journal/{slug}``), never a raw slug path — raw paths would explode
cardinality and could leak content. The caller derives the template from
``request.scope['route'].path``; ``main.py`` falls back to a coarse bucket when
no route matched.

Privacy: labels are method / route-template / status-class only. No query
strings, no request bodies, no user content ever enter a metric.
"""
from __future__ import annotations

import threading
from collections import defaultdict

# Fixed histogram buckets (seconds). Cumulative "less-than-or-equal" upper
# bounds; "+Inf" is always implied as the total. A handful is plenty for a
# small site and keeps the exposition compact.
_DURATION_BUCKETS: tuple[float, ...] = (0.005, 0.025, 0.1, 0.25, 0.5, 1.0, 2.5)

_REQUESTS = "discammer_requests_total"
_ERRORS = "discammer_errors_total"
_DURATION = "discammer_request_duration_seconds"
# AN-1: privacy-first product-usage counter. Which server-rendered SURFACE a
# reader loaded, keyed only by a coarse surface name + UI language. Never a
# slug/path/query/body/IP or any user content (see main.py `_record_surface_view`).
_SURFACE_VIEWS = "discammer_surface_views_total"


def status_class(status: int) -> str:
    """Bucket an HTTP status into a low-cardinality class label (e.g. 200 -> 2xx)."""
    try:
        return f"{int(status) // 100}xx"
    except (TypeError, ValueError):
        return "other"


def _fmt_float(value: float) -> str:
    """Render a float for Prometheus without trailing noise (ints stay int-ish)."""
    if value == int(value):
        return str(int(value))
    return repr(value)


def _escape_label(value: str) -> str:
    """Escape a label value per the Prometheus text format (\\, \", newline)."""
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


class MetricsCollector:
    """Thread-safe in-memory RED collector. Tiny by design — no external deps."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # (method, route, status_class) -> count
        self._requests: dict[tuple[str, str, str], float] = defaultdict(float)
        self._errors: dict[tuple[str, str, str], float] = defaultdict(float)
        # (method, route) -> {bucket_upper_bound: cumulative_count}
        self._hist_buckets: dict[tuple[str, str], list[float]] = defaultdict(
            lambda: [0.0] * (len(_DURATION_BUCKETS) + 1)
        )
        self._hist_sum: dict[tuple[str, str], float] = defaultdict(float)
        self._hist_count: dict[tuple[str, str], float] = defaultdict(float)
        # AN-1: (surface, lang) -> count. Cardinality is tiny by construction —
        # both labels come from fixed vocabularies in main.py.
        self._surface_views: dict[tuple[str, str], float] = defaultdict(float)

    def observe(self, *, method: str, route: str, status: int, duration_s: float) -> None:
        """Record one request. Called once per request from the middleware."""
        cls = status_class(status)
        key = (method, route, cls)
        hkey = (method, route)
        with self._lock:
            self._requests[key] += 1.0
            if cls == "5xx":
                self._errors[key] += 1.0
            # Histogram: increment every bucket whose upper bound >= duration.
            buckets = self._hist_buckets[hkey]
            for i, ub in enumerate(_DURATION_BUCKETS):
                if duration_s <= ub:
                    buckets[i] += 1.0
            buckets[-1] += 1.0  # +Inf bucket
            self._hist_sum[hkey] += duration_s
            self._hist_count[hkey] += 1.0

    def observe_surface(self, *, surface: str, lang: str) -> None:
        """Record one product-usage surface view (AN-1).

        ``surface`` and ``lang`` come from fixed vocabularies chosen in the
        middleware — never from a slug, path, query, body, or any user content —
        so cardinality stays bounded and no PII can enter the label."""
        with self._lock:
            self._surface_views[(surface, lang)] += 1.0

    def render(self) -> str:
        """Render the full exposition as Prometheus text (version 0.0.4)."""
        lines: list[str] = []
        with self._lock:
            requests = dict(self._requests)
            errors = dict(self._errors)
            hist_buckets = {k: list(v) for k, v in self._hist_buckets.items()}
            hist_sum = dict(self._hist_sum)
            hist_count = dict(self._hist_count)
            surface_views = dict(self._surface_views)

        # Requests counter.
        lines.append(f"# HELP {_REQUESTS} Total HTTP requests by method, route and status class.")
        lines.append(f"# TYPE {_REQUESTS} counter")
        for (method, route, cls), value in sorted(requests.items()):
            lines.append(
                f'{_REQUESTS}{{method="{_escape_label(method)}",'
                f'route="{_escape_label(route)}",status_class="{cls}"}} {_fmt_float(value)}'
            )

        # Errors counter.
        lines.append(f"# HELP {_ERRORS} Total HTTP 5xx responses by method, route and status class.")
        lines.append(f"# TYPE {_ERRORS} counter")
        for (method, route, cls), value in sorted(errors.items()):
            lines.append(
                f'{_ERRORS}{{method="{_escape_label(method)}",'
                f'route="{_escape_label(route)}",status_class="{cls}"}} {_fmt_float(value)}'
            )

        # Duration histogram.
        lines.append(f"# HELP {_DURATION} HTTP request duration in seconds.")
        lines.append(f"# TYPE {_DURATION} histogram")
        bucket_labels = [_fmt_float(b) for b in _DURATION_BUCKETS] + ["+Inf"]
        for (method, route), buckets in sorted(hist_buckets.items()):
            m = _escape_label(method)
            r = _escape_label(route)
            for label, cumulative in zip(bucket_labels, buckets):
                lines.append(
                    f'{_DURATION}_bucket{{method="{m}",route="{r}",le="{label}"}} {_fmt_float(cumulative)}'
                )
            lines.append(
                f'{_DURATION}_sum{{method="{m}",route="{r}"}} {_fmt_float(hist_sum.get((method, route), 0.0))}'
            )
            lines.append(
                f'{_DURATION}_count{{method="{m}",route="{r}"}} {_fmt_float(hist_count.get((method, route), 0.0))}'
            )

        # AN-1 surface-views counter. Labels are the coarse surface name + UI
        # language only — no slug/path/query ever reaches here.
        lines.append(f"# HELP {_SURFACE_VIEWS} Product-usage page-surface views by surface and language.")
        lines.append(f"# TYPE {_SURFACE_VIEWS} counter")
        for (surface, lang), value in sorted(surface_views.items()):
            lines.append(
                f'{_SURFACE_VIEWS}{{surface="{_escape_label(surface)}",'
                f'lang="{_escape_label(lang)}"}} {_fmt_float(value)}'
            )

        return "\n".join(lines) + "\n"


# Process-wide singleton fed by the middleware in main.py.
collector = MetricsCollector()
