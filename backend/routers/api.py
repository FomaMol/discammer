from html import escape as html_escape
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from config import GIT_SHA
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
    return rows


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
