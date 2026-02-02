import json
import threading
from html import escape as html_escape
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from config import CONTENT_DIR, GIT_SHA
from database import (
    SNIPPET_CLOSE,
    SNIPPET_OPEN,
    get_conn,
    get_course_modules,
    get_db,
    get_guides,
    get_lesson,
    get_lessons_for_module,
    get_module_by_slug,
    get_posts,
    search_content,
)
from models import (
    CourseModuleResponse,
    LessonResponse,
    LessonSummary,
    LessonProgressSummary,
    PostResponse,
    ScamGuideResponse,
)

router = APIRouter(prefix="/api", tags=["api"])


Locale = Literal["en", "ru"]


# ---------------------------------------------------------------------------
# Search snippet rendering — the ONLY sanctioned dangerouslySetInnerHTML field.
# ---------------------------------------------------------------------------
def snippet_to_html(snippet_raw: str | None) -> str:
    """Convert a raw FTS snippet (with \\x01/\\x02 markers) to safe highlight HTML.

    Order is load-bearing and is the entire security contract:
      1. HTML-escape the raw text FIRST — any ``<``/``>``/``&`` from indexed
         CONTENT becomes ``&lt;``/``&gt;``/``&amp;`` and can never be a tag.
      2. THEN swap the control-char markers for ``<mark>``/``</mark>``.
    The result is the only string ever fed to ``dangerouslySetInnerHTML`` in the
    SearchConsole island / rendered |safe in search.html.
    """
    if not snippet_raw:
        return ""
    escaped = html_escape(snippet_raw)
    escaped = escaped.replace(SNIPPET_OPEN, "<mark>").replace(SNIPPET_CLOSE, "</mark>")
    return escaped


@router.get("/health", include_in_schema=False)
async def health():
    """Liveness/readiness probe with content row counts.

    Returns 200 ``{"status":"ok",...}`` when the DB is reachable and 503
    ``{"status":"error","db":"down",...}`` on any DB failure. Deliberately does
    NOT use ``Depends(get_conn)``: a failing dependency raises and yields a 500,
    but a health endpoint must signal DB outage as 503. So the connection is
    opened inside a try/except via the ``get_db()`` context manager.
    """
    try:
        async with get_db() as db:
            posts = (await (await db.execute("SELECT COUNT(*) FROM post")).fetchone())[0]
            guides = (await (await db.execute("SELECT COUNT(*) FROM scam_guide")).fetchone())[0]
            modules = (await (await db.execute("SELECT COUNT(*) FROM course_module")).fetchone())[0]
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "version": GIT_SHA, "db": "down"},
        )
    return {
        "status": "ok",
        "version": GIT_SHA,
        "db": "ok",
        "posts": posts,
        "guides": guides,
        "modules": modules,
    }


@router.get("/posts", response_model=List[PostResponse])
async def list_posts(
    type: Optional[str] = Query(default=None, description="Filter by post type"),
    limit: Optional[int] = Query(default=None, ge=1, description="Max results"),
    lang: Locale = Query(default="en"),
    conn=Depends(get_conn),
):
    rows = await get_posts(conn, type_filter=type, limit=limit, locale=lang)
    return rows


@router.get("/guides", response_model=List[ScamGuideResponse])
async def list_guides(lang: Locale = Query(default="en"), conn=Depends(get_conn)):
    rows = await get_guides(conn, locale=lang)
    return rows


@router.get("/course/modules", response_model=List[CourseModuleResponse])
async def list_course_modules(lang: Locale = "en", conn=Depends(get_conn)):
    rows = await get_course_modules(conn, locale=lang)
    return rows


def _content_revision(row: dict) -> str | None:
    config = row.get('widget_config')
    if isinstance(config, dict):
        revision = config.get('revision')
        return revision if isinstance(revision, str) else None
    return None


@router.get('/course/lesson-manifest', response_model=List[LessonProgressSummary])
async def course_lesson_manifest(lang: Locale = 'en', conn=Depends(get_conn)):
    """One small response for revision-aware, local-only progress summaries."""
    cursor = await conn.execute(
        'SELECT module_slug, slug, widget_type, widget_config_json FROM lesson WHERE locale = ? ORDER BY module_slug, "order"',
        (lang,),
    )
    rows = await cursor.fetchall()
    manifest = []
    for row in rows:
        item = dict(row)
        if item['widget_config_json']:
            item['widget_config'] = json.loads(item['widget_config_json'] or '{}')
        manifest.append({'module_slug': item['module_slug'], 'slug': item['slug'],
                         'content_revision': _content_revision(item)})
    return manifest


@router.get("/course/{module_slug}", response_model=CourseModuleResponse)
async def get_course_module(module_slug: str, lang: Locale = "en", conn=Depends(get_conn)):
    row = await get_module_by_slug(conn, slug=module_slug, locale=lang)
    if not row:
        raise HTTPException(status_code=404, detail="Module not found")
    return row


@router.get(
    "/course/{module_slug}/lessons", response_model=List[LessonSummary]
)
async def list_module_lessons(module_slug: str, lang: Locale = "en", conn=Depends(get_conn)):
    rows = await get_lessons_for_module(conn, module_slug=module_slug, locale=lang)
    return [{**row, 'content_revision': _content_revision(row)} for row in rows]


@router.get(
    "/course/{module_slug}/{lesson_slug}", response_model=LessonResponse
)
async def get_course_lesson(
    module_slug: str, lesson_slug: str, lang: Locale = "en", conn=Depends(get_conn)
):
    row = await get_lesson(conn, module_slug=module_slug, lesson_slug=lesson_slug, locale=lang)
    if not row:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return row


@router.get("/search")
async def search(
    q: str = Query(default="", description="Search query"),
    kind: Optional[Literal["post", "guide"]] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=20),
    lang: Locale = Query(default="en"),
    conn=Depends(get_conn),
):
    """Full-text search over posts + guides.

    Returns a JSON list ``[{kind, slug, title, snippet_html}]`` where
    ``snippet_html`` is the escape-then-marked highlight string (see
    ``snippet_to_html``) — the only field a consumer may pass to
    ``dangerouslySetInnerHTML``. A blank/whitespace ``q`` yields ``[]`` (200).
    """
    if not q or not q.strip():
        return []
    rows = await search_content(conn, q=q, kind=kind, limit=limit, lang=lang)
    return [
        {
            "kind": row["kind"],
            "slug": row["slug"],
            "title": row["title"],
            "snippet_html": snippet_to_html(row.get("snippet_raw")),
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# UX-5 — updatable threat-rules feed (GET /api/threat-rules).
#
# Serves a checked-in, versioned DATA feed (URL-shortener hosts + high-abuse
# TLDs) straight from ``content/threat-rules/threat-rules.json``. It is CONTENT,
# reviewed like markdown — NOT user state — and is deliberately served from the
# file rather than a DB table, so it is untouched by the startup wipe+reseed.
#
# The client MERGES this data (set-union) into its built-in shortener/TLD lists
# so the in-browser checker/inspector pick up new signatures WITHOUT a frontend
# redeploy. The feed carries DATA ONLY — never serialized functions, never any
# user input. The rule *functions* stay compiled into the JS bundle; only these
# two data lists are updatable. The response echoes no request body and holds no
# user text, so the client's "nothing leaves the device" guarantee is preserved
# (this GET is the sole new network call and sends no user data).
# ---------------------------------------------------------------------------
_THREAT_RULES_PATH: Path = CONTENT_DIR / "threat-rules" / "threat-rules.json"

# Parsed feed cached in-process — the file is static content, so we read + parse
# it once per worker. ``None`` means "not yet loaded"; the endpoint test resets
# it to force a re-read against a patched path.
_THREAT_RULES_CACHE: Optional[dict] = None
_THREAT_RULES_LOCK = threading.Lock()

# The empty-but-valid feed returned when the file is missing/malformed. Serving
# this (instead of 500ing) lets the client fall back cleanly to its built-ins.
_EMPTY_THREAT_FEED = {"version": "unavailable", "shortener_hosts": [], "suspicious_tlds": []}


def _read_threat_rules_file(path: Path) -> dict:
    """Read + validate the feed file, returning a normalized dict.

    Pure and defensive: a missing file, unreadable file, malformed JSON, or a
    wrong-shaped payload all degrade to ``_EMPTY_THREAT_FEED`` rather than
    raising, so the endpoint (and the app) can never crash on a bad file. Every
    host/TLD is coerced to a lowercase string; non-string entries are dropped.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return dict(_EMPTY_THREAT_FEED)
    if not isinstance(data, dict):
        return dict(_EMPTY_THREAT_FEED)

    version = data.get("version")
    shortener = data.get("shortener_hosts")
    tlds = data.get("suspicious_tlds")

    def _clean(items) -> list:
        if not isinstance(items, list):
            return []
        return [s.strip().lower() for s in items if isinstance(s, str) and s.strip()]

    return {
        "version": version if isinstance(version, str) and version else "unavailable",
        "shortener_hosts": _clean(shortener),
        "suspicious_tlds": _clean(tlds),
    }


def _load_threat_rules() -> dict:
    """Return the parsed feed, reading the file at most once per worker."""
    global _THREAT_RULES_CACHE
    cached = _THREAT_RULES_CACHE
    if cached is not None:
        return cached
    with _THREAT_RULES_LOCK:
        if _THREAT_RULES_CACHE is None:
            _THREAT_RULES_CACHE = _read_threat_rules_file(_THREAT_RULES_PATH)
        return _THREAT_RULES_CACHE


@router.get("/threat-rules")
async def threat_rules(lang: Locale = Query(default="en")):
    """Serve the versioned threat-rules DATA feed for the client-side engines.

    Host/TLD lists are not localized, so ``lang`` is accepted for forward-compat
    and simply echoed. A long-ish ``public`` cache lets Cloudflare (CF-5) hold it
    at the edge while still refreshing within the hour so new rules propagate
    without waiting on a build.
    """
    feed = _load_threat_rules()
    payload = {
        "version": feed["version"],
        "shortener_hosts": feed["shortener_hosts"],
        "suspicious_tlds": feed["suspicious_tlds"],
        "lang": lang,
    }
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=3600"},
    )
