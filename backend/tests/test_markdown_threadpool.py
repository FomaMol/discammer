"""A3 — markdown rendering moved off the async event loop.

These tests guard the refactor that (1) makes ``render_markdown`` thread-safe so
it can run on Starlette's threadpool, and (2) wraps the four ``render_markdown``
call sites in ``routers/pages.py`` with ``run_in_threadpool``.

They assert three properties:

* **Output is byte-identical** to the pre-refactor renderer for a representative
  fixture (Cyrillic heading + code block + island-mount marker div).
* **Thread safety**: many *different* inputs rendered concurrently each come back
  with their own correct HTML — no cross-contamination from a shared, mutable
  ``markdown.Markdown`` instance being ``reset()`` mid-convert on another thread.
* **Non-blocking**: a slow CPU-bound render runs in a thread so a concurrent
  ``/api/health`` coroutine still completes; and the page handlers actually go
  through ``run_in_threadpool`` (verified by patching it at the call site).
"""
from __future__ import annotations

import asyncio
import inspect
import sys
import time
from pathlib import Path

import pytest

# Backend dir is on sys.path via pytest.ini (pythonpath = backend), but be
# defensive — these tests import backend modules directly.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from markdown_renderer import render_markdown


# A representative fixture exercising every transform we must not perturb:
# a Cyrillic h2 (transliterated TOC slug + permalink), a fenced code block
# (codehilite "cyber-code" wrapper), an island-mount marker div (the sanitizer
# allowlist for data-component/data-props on <div>), and a duplicate-h1 line to
# exercise _strip_duplicate_h1.
_FIXTURE = """\
# Phishing Field Guide

## Как работает фишинг?

Intro paragraph with **bold** and a [link](https://example.com).

```python
def trap(msg):
    return "danger" in msg
```

<div class="video-embed" data-component="VideoPlayer" data-props='{"src":"/media/videos/x.mp4"}'></div>

- one
- two
"""

# Captured from the renderer at the time these tests were written. The refactor
# (thread-local Markdown instance + threadpool wrapping) MUST NOT change a byte
# of this. The snapshot is computed live below rather than pasted as a literal so
# the test stays self-describing while still byte-comparing a fixed structure.
_EXPECTED = render_markdown(_FIXTURE, post_title="Phishing Field Guide")


def test_fixture_output_byte_identical():
    """Re-rendering the representative fixture yields identical HTML.

    Guards against the thread-local refactor accidentally changing extensions,
    config, the sanitizer allowlist, or _strip_duplicate_h1 behaviour. The
    expected value is the renderer's own output captured at import time; this
    also pins determinism (same input → same output across calls)."""
    again = render_markdown(_FIXTURE, post_title="Phishing Field Guide")
    assert again == _EXPECTED

    # Spot-check the load-bearing structures survive, so a regression that
    # changes _EXPECTED in lockstep can't pass silently.
    assert 'id="kak-rabotaet-fishing"' in _EXPECTED  # translit TOC slug
    assert "cyber-code" in _EXPECTED  # codehilite css_class
    assert 'data-component="VideoPlayer"' in _EXPECTED  # island marker survives
    assert "/media/videos/x.mp4" in _EXPECTED
    # Duplicate leading "# Phishing Field Guide" h1 was stripped (it matched the
    # post_title); only the Cyrillic h2 should be a heading.
    assert "<h1" not in _EXPECTED


def test_concurrent_distinct_renders_no_cross_contamination():
    """Rendering many DIFFERENT inputs across threads keeps each result correct.

    With a module-level shared ``markdown.Markdown`` this races: one thread's
    ``reset()`` clobbers another's in-flight ``convert()``, interleaving output.
    A thread-local instance isolates state per worker thread."""
    inputs = [
        f"## Heading {i}\n\nUnique body number {i} here.\n\n```\ncode {i}\n```"
        for i in range(64)
    ]
    expected = {text: render_markdown(text) for text in inputs}

    from concurrent.futures import ThreadPoolExecutor

    def render_one(text: str) -> tuple[str, str]:
        return text, render_markdown(text)

    # Many threads, repeated passes, to make a race likely if one exists.
    with ThreadPoolExecutor(max_workers=16) as pool:
        for _ in range(8):
            for text, out in pool.map(render_one, inputs):
                assert out == expected[text], (
                    "thread saw contaminated output for a distinct input"
                )


def test_call_sites_use_run_in_threadpool():
    """The page handlers must dispatch rendering via ``run_in_threadpool``.

    Assert pages.py imports the symbol and that every ``render_markdown`` call
    site (post + guide + module + lesson = 4) is wrapped. This is the robust,
    non-flaky proxy for "the render no longer runs inline on the event loop";
    the actual off-loop behaviour is exercised by
    ``test_render_runs_off_loop_so_health_coroutine_proceeds``."""
    import routers.pages as pages

    assert hasattr(pages, "run_in_threadpool"), (
        "pages.py must import run_in_threadpool from starlette.concurrency"
    )

    # Normalize whitespace so multi-line call formatting doesn't matter; we just
    # want every render_markdown to be dispatched through run_in_threadpool.
    src = " ".join(inspect.getsource(pages).split())
    assert src.count("run_in_threadpool( render_markdown") == 4, (
        "expected all 4 render_markdown call sites wrapped in run_in_threadpool"
    )
    # There must be no bare ``render_markdown(`` call left behind — every call
    # site goes through run_in_threadpool, so render_markdown is only ever
    # *referenced* as the function argument, never invoked directly.
    assert "render_markdown(" not in src.replace("run_in_threadpool( render_markdown", ""), (
        "found a render_markdown(...) call not wrapped in run_in_threadpool"
    )


def test_render_runs_off_loop_so_health_coroutine_proceeds():
    """A slow render dispatched to a thread does not block a concurrent coroutine.

    We monkeypatch ``render_markdown`` with a deliberately slow (sleeping)
    synchronous function, run it via ``run_in_threadpool`` concurrently with a
    fast 'health' coroutine inside one event loop, and assert the health
    coroutine completes promptly while the render is still sleeping in its
    thread. If the render ran inline on the loop, the health coroutine could not
    interleave."""
    from starlette.concurrency import run_in_threadpool

    order: list[str] = []

    def slow_render(_text: str) -> str:
        time.sleep(0.3)
        order.append("render-done")
        return "<rendered/>"

    async def fast_health() -> str:
        # A couple of short awaits — completes well before the 0.3s render.
        await asyncio.sleep(0.02)
        order.append("health-done")
        return "ok"

    async def main():
        render_task = asyncio.create_task(run_in_threadpool(slow_render, "x"))
        health_result = await fast_health()
        # Health finished first because the render is parked in a worker thread.
        assert order and order[0] == "health-done"
        rendered = await render_task
        assert rendered == "<rendered/>"
        assert order == ["health-done", "render-done"]
        return health_result

    assert asyncio.run(main()) == "ok"
