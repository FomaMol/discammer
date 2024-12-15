"""Shared per-key token-bucket rate limiting (SEC-2).

Extracted from the original ``/api/client-errors`` limiter in ``main.py`` so the
same fail-safe, memory-bounded token bucket can guard any endpoint. Each
``RateLimiter`` keeps one bucket per key (the key is the real client IP — see
``main._client_ip``). Buckets refill at ``rate_per_min`` tokens/minute, capped at
``rate_per_min`` tokens.

Memory safety: the bucket dict is hard-capped at ``max_keys``. When it is full
and a NEW key arrives, stale buckets (untouched for a full refill window — they
would refill to full anyway) are evicted first; if that frees nothing, the whole
dict is reset. The limiter is abuse-control telemetry, never correctness, so a
bounded worst-case reset is the right fail-safe — never a crash, never unbounded
memory.

A non-positive ``rate_per_min`` disables the limiter (``allow`` always True), so
an endpoint can be turned off via config without branching at the call site.
"""
from __future__ import annotations

import time


class RateLimiter:
    """A per-key token bucket. Thread-safety note: the app is async/single
    process per worker; ``allow`` does only synchronous dict work with no await,
    so it runs atomically within the event loop. Each uvicorn worker has its own
    in-process limiter (acceptable: the edge WAF — CF-6 — is the primary global
    limiter; this is origin-side defense in depth)."""

    __slots__ = (
        "rate_per_min",
        "capacity",
        "_refill_per_sec",
        "max_keys",
        "refill_window_sec",
        "_time",
        "_buckets",
    )

    def __init__(
        self,
        rate_per_min: float,
        *,
        max_keys: int = 4096,
        refill_window_sec: float = 60.0,
        time_func=time.monotonic,
    ) -> None:
        self.rate_per_min = float(rate_per_min)
        self.capacity = float(rate_per_min)
        self._refill_per_sec = self.rate_per_min / 60.0
        self.max_keys = max_keys
        self.refill_window_sec = refill_window_sec
        self._time = time_func
        # key -> (tokens, last_refill_monotonic)
        self._buckets: dict[str, tuple[float, float]] = {}

    @property
    def buckets(self) -> dict[str, tuple[float, float]]:
        """The live bucket store (exposed so tests can clear it / inspect it)."""
        return self._buckets

    def allow(self, key: str) -> bool:
        """Admission test. Returns False when ``key`` is over its per-minute
        rate. Side effect: decrements the bucket on admit, refilling first."""
        if self.rate_per_min <= 0:
            return True  # disabled

        now = self._time()
        existing = self._buckets.get(key)

        if existing is None and len(self._buckets) >= self.max_keys:
            # At the cap and adding a NEW key: drop stale buckets (idle longer
            # than a full refill window — they'd be back to full anyway). If that
            # frees nothing, reset wholesale: a bounded worst case, never a leak.
            cutoff = now - self.refill_window_sec
            for stale in [k for k, (_, last) in self._buckets.items() if last < cutoff]:
                del self._buckets[stale]
            if len(self._buckets) >= self.max_keys:
                self._buckets.clear()

        tokens, last = existing if existing is not None else (self.capacity, now)
        tokens = min(self.capacity, tokens + (now - last) * self._refill_per_sec)

        if tokens < 1.0:
            self._buckets[key] = (tokens, now)
            return False
        self._buckets[key] = (tokens - 1.0, now)
        return True

    def clear(self) -> None:
        """Drop all buckets (used by tests to isolate the in-memory state)."""
        self._buckets.clear()
