#!/usr/bin/env python3
"""Generate per-content Open Graph cards for every post and guide (en + ru).

This is the *source of truth* for the committed PNGs under
``backend/static/images/og/{posts,guides}/`` — never hand-edit those PNGs.
Re-running this script regenerates the full set deterministically:

    backend/.venv/bin/python scripts/og_generate.py

It is idempotent (overwrites in place) and prints a summary count.

How it works
------------
1. Read every row from the seeded SQLite DB at ``config.DATABASE_PATH`` (the
   same DB the running app serves). Posts → ``post`` table, guides →
   ``scam_guide`` table; both locales (en, ru).
2. For each item, fill ``scripts/og_template.html`` with the localized title, a
   kind badge (INTERVIEW / NEWSLETTER / ARTICLE / SCAM GUIDE — colors matched to
   the journal.html badges), and, for guides, a 5-slat threat meter (same colors
   as the guide.html risk meter).
3. Screenshot the filled template at exactly 1200×630 (deviceScaleFactor 1, no
   scrollbars) with Playwright's bundled chromium and write the PNG.

Playwright is a TOOLING-only dependency (offline PNG generation) — it is NOT in
requirements.txt. Install once into the backend venv with::

    backend/.venv/bin/pip install playwright

It reuses the already-installed chromium under ~/Library/Caches/ms-playwright;
if it insists on its own build run ``backend/.venv/bin/playwright install chromium``.
"""
from __future__ import annotations

import html
import sqlite3
import sys
import time
from pathlib import Path

# --- Make backend/ importable so we can read config.DATABASE_PATH / STATIC_DIR.
SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import config  # noqa: E402  (after sys.path tweak)

from playwright.sync_api import sync_playwright  # noqa: E402

TEMPLATE_PATH = SCRIPTS_DIR / "og_template.html"
OG_ROOT = config.STATIC_DIR / "images" / "og"

LANGS = ("en", "ru")

# Card dimensions — the OG spec size. Screenshot viewport is locked to this.
WIDTH, HEIGHT = 1200, 630

# --- Badge colors, lifted verbatim from journal.html so the card matches the
#     site's own badges exactly.
KIND_CYAN = "#65def0"   # interview
KIND_GREEN = "#7ce896"  # newsletter
KIND_AMBER = "#f4b965"  # article
KIND_RED = "#e76670"    # scam guide

POST_KIND = {
    "interview": ("INTERVIEW", KIND_CYAN),
    "newsletter": ("NEWSLETTER", KIND_GREEN),
    "article": ("ARTICLE", KIND_AMBER),
}

# Bottom terminal meta line per kind (localized op marker), keyed (kind, lang).
KIND_META = {
    "interview": {"en": "// FIELD BRIEFING · INTERVIEW LOG", "ru": "// ПОЛЕВОЙ ОТЧЁТ · ИНТЕРВЬЮ"},
    "newsletter": {"en": "// DISPATCH · NEWSLETTER FEED", "ru": "// СВОДКА · РАССЫЛКА"},
    "article": {"en": "// ANALYSIS · ARTICLE DATABASE", "ru": "// АНАЛИЗ · БАЗА СТАТЕЙ"},
    "guide": {"en": "// THREAT DATABASE · SCAM DOSSIER", "ru": "// БАЗА УГРОЗ · ДОСЬЕ"},
}

GUIDE_LABEL = {"en": "SCAM GUIDE", "ru": "ДОСЬЕ УГРОЗЫ"}

# Threat-meter slat colors by level, matching guide.html's risk meter:
#   filled slat i gets a color by the *guide's* level (single hue per card),
#   ramping green → amber → orange → red as the level rises.
THREAT_FILL = {
    1: "#7ce896",
    2: "#7ce896",
    3: "#f4b965",
    4: "#f29b6c",
    5: "#e76670",
}


def _title_size(title: str, lang: str) -> int:
    """Pick a title font-size (px) that keeps long titles inside the card.

    Cyrillic runs ~10-15% wider per glyph, so RU titles get a slightly tighter
    budget. The CSS line-clamp (3 lines) is the hard safety net; this just keeps
    typical titles from looking cramped or from clamping mid-word too early.
    """
    n = len(title)
    # Effective length: pad RU to account for wider glyphs.
    eff = n * (1.13 if lang == "ru" else 1.0)
    if eff <= 26:
        return 72
    if eff <= 40:
        return 64
    if eff <= 58:
        return 54
    if eff <= 80:
        return 46
    return 40


def _threat_block(level: int | None) -> str:
    """Render the 5-slat threat meter HTML for a guide, or '' if no level."""
    if not level:
        return ""
    level = max(1, min(5, int(level)))
    fill = THREAT_FILL[level]
    slats = []
    for i in range(1, 6):
        if i <= level:
            slats.append(f'<span class="slat" style="background:{fill};"></span>')
        else:
            slats.append('<span class="slat off"></span>')
    slats_html = "".join(slats)
    label = "THREAT LEVEL"
    return (
        '<div class="threat">'
        f'<span class="threat-label">{label}</span>'
        f'<span class="slats">{slats_html}</span>'
        f'<span class="threat-label" style="color:{fill};">{level}/5</span>'
        "</div>"
    )


def _render_html(template: str, *, title: str, kind_label: str, kind_color: str,
                 meta_line: str, threat_html: str, title_size: int) -> str:
    """Fill the template placeholders. ``title`` is HTML-escaped; the rest are
    trusted constants assembled above."""
    return (
        template
        .replace("__KIND_LABEL__", html.escape(kind_label))
        .replace("__KIND_COLOR__", kind_color)
        .replace("__TITLE__", html.escape(title))
        .replace("__TITLE_SIZE__", str(title_size))
        .replace("__META_LINE__", html.escape(meta_line))
        .replace("__THREAT_BLOCK__", threat_html)
    )


def _load_items() -> tuple[list[dict], list[dict]]:
    """Read posts + guides for both locales from the seeded SQLite DB."""
    if not config.DATABASE_PATH.exists():
        raise SystemExit(
            f"DB not found at {config.DATABASE_PATH}. Start the app once "
            "(or run a seed) so the content tables are populated, then re-run."
        )
    con = sqlite3.connect(config.DATABASE_PATH)
    con.row_factory = sqlite3.Row
    posts = [
        dict(r)
        for r in con.execute(
            "SELECT slug, locale, type, title FROM post "
            "WHERE locale IN ('en','ru') ORDER BY locale, type, slug"
        )
    ]
    guides = [
        dict(r)
        for r in con.execute(
            "SELECT slug, locale, title, threat_level FROM scam_guide "
            "WHERE locale IN ('en','ru') ORDER BY locale, slug"
        )
    ]
    con.close()
    return posts, guides


def main() -> int:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    posts, guides = _load_items()

    (OG_ROOT / "posts").mkdir(parents=True, exist_ok=True)
    (OG_ROOT / "guides").mkdir(parents=True, exist_ok=True)

    # Build the full render plan up front: (out_path, html) tuples.
    plan: list[tuple[Path, str]] = []

    for p in posts:
        lang = p["locale"]
        kind = p["type"]
        label, color = POST_KIND.get(kind, (kind.upper(), "#aab2c4"))
        title = p["title"] or p["slug"]
        page_html = _render_html(
            template,
            title=title,
            kind_label=label,
            kind_color=color,
            meta_line=KIND_META.get(kind, {}).get(lang, "// DISCAMMER"),
            threat_html="",
            title_size=_title_size(title, lang),
        )
        out = OG_ROOT / "posts" / f"{p['slug']}.{lang}.png"
        plan.append((out, page_html))

    for g in guides:
        lang = g["locale"]
        title = g["title"] or g["slug"]
        page_html = _render_html(
            template,
            title=title,
            kind_label=GUIDE_LABEL.get(lang, "SCAM GUIDE"),
            kind_color=KIND_RED,
            meta_line=KIND_META["guide"].get(lang, "// DISCAMMER"),
            threat_html=_threat_block(g.get("threat_level")),
            title_size=_title_size(title, lang),
        )
        out = OG_ROOT / "guides" / f"{g['slug']}.{lang}.png"
        plan.append((out, page_html))

    started = time.time()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
        )
        # Hide any scrollbar gutter so the screenshot is a clean 1200×630.
        page.add_style_tag(content="::-webkit-scrollbar{display:none}")
        for out, page_html in plan:
            page.set_content(page_html, wait_until="networkidle")
            page.screenshot(
                path=str(out),
                type="png",
                clip={"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT},
            )
        browser.close()

    n_posts = sum(1 for o, _ in plan if o.parent.name == "posts")
    n_guides = sum(1 for o, _ in plan if o.parent.name == "guides")
    total_bytes = sum(o.stat().st_size for o, _ in plan)
    elapsed = time.time() - started
    print(
        f"Generated {len(plan)} OG cards "
        f"({n_posts} posts + {n_guides} guides) "
        f"in {elapsed:.1f}s → {OG_ROOT}"
    )
    print(f"Total image bytes: {total_bytes:,} ({total_bytes / 1024 / 1024:.2f} MiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
