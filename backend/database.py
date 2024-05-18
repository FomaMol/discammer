import json
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

import aiosqlite

import config


SQL_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    title TEXT NOT NULL,
    subtitle TEXT,
    type TEXT NOT NULL CHECK (type IN ('interview', 'newsletter', 'article')),
    content TEXT,
    cover_image TEXT,
    published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slug, locale)
);

CREATE TABLE IF NOT EXISTS scam_guide (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    icon TEXT,
    threat_level INTEGER,
    category TEXT,
    published_at TEXT,
    UNIQUE(slug, locale)
);

CREATE TABLE IF NOT EXISTS course_module (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    "order" INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    is_locked INTEGER DEFAULT 1,
    icon TEXT,
    duration TEXT,
    lessons INTEGER DEFAULT 0,
    difficulty TEXT,
    topics_json TEXT,
    objectives_json TEXT,
    accent TEXT,
    UNIQUE(slug, locale)
);

CREATE TABLE IF NOT EXISTS lesson (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_slug TEXT NOT NULL,
    slug TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en',
    "order" INTEGER NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT,
    widget_type TEXT,
    widget_config_json TEXT,
    est_minutes INTEGER DEFAULT 5,
    UNIQUE(module_slug, slug, locale)
);
"""

# Columns each table must carry — ``init_db`` drops + recreates a content
# table if the live DB is missing any of them. Safe because all four tables are
# rebuilt from seed on every startup.
_POST_REQUIRED_COLS = {
    "slug",
    "locale",
    "title",
    "type",
    "content",
}

_SCAM_GUIDE_REQUIRED_COLS = {
    "slug",
    "locale",
    "title",
    "content",
}

_COURSE_MODULE_REQUIRED_COLS = {
    "slug",
    "locale",
    "icon",
    "duration",
    "lessons",
    "difficulty",
    "topics_json",
    "objectives_json",
    "accent",
}

_LESSON_REQUIRED_COLS = {
    "module_slug",
    "slug",
    "locale",
    "order",
    "title",
    "body_md",
    "widget_type",
    "widget_config_json",
    "est_minutes",
}


async def init_db() -> None:
    """Initialise the database: ensure the data directory and tables exist.

    All content tables are rebuilt from seed on every startup, so it is safe
    to drop any of them when its column set is out of sync with the current
    schema.
    """
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        for table, required in (
            ("post", _POST_REQUIRED_COLS),
            ("scam_guide", _SCAM_GUIDE_REQUIRED_COLS),
            ("course_module", _COURSE_MODULE_REQUIRED_COLS),
            ("lesson", _LESSON_REQUIRED_COLS),
        ):
            cursor = await db.execute(f"PRAGMA table_info({table})")
            existing_cols = {row[1] for row in await cursor.fetchall()}
            if existing_cols and not required.issubset(existing_cols):
                await db.execute(f"DROP TABLE {table}")

        await db.executescript(SQL_CREATE_TABLES)
        await db.commit()


@asynccontextmanager
async def get_db():
    """Async context manager that yields an aiosqlite connection with row_factory."""
    db = await aiosqlite.connect(config.DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def get_conn():
    """FastAPI dependency: one aiosqlite connection per request.

    Opens a single connection, configures ``row_factory`` and ``busy_timeout``
    once, yields it for the lifetime of the request, and closes it on teardown.
    Routes that depend on this and pass the connection into the CRUD helpers
    below therefore open exactly one connection per request instead of one per
    helper call.
    """
    conn = await aiosqlite.connect(config.DATABASE_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA busy_timeout = 5000")
    try:
        yield conn
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# CRUD helpers
#
# Each helper takes a live ``conn`` (an aiosqlite connection) as its first
# argument and uses it directly. Request handlers obtain that connection from
# the ``get_conn`` dependency so a whole request shares one connection.
#
# ``conn`` is optional so non-request callers (e.g. the SEO router, which is
# owned by another worker this wave) keep working: when ``conn`` is None the
# helper opens a short-lived connection of its own via ``get_db()``.
# ---------------------------------------------------------------------------

async def get_posts(
    conn=None,
    type_filter: Optional[str] = None,
    limit: Optional[int] = None,
    locale: str = "en",
) -> List[Dict]:
    """Return posts for ``locale``, optionally filtered by type and limited."""
    if conn is None:
        async with get_db() as db:
            return await get_posts(
                db, type_filter=type_filter, limit=limit, locale=locale
            )
    query = "SELECT * FROM post WHERE locale = ?"
    params: list = [locale]
    if type_filter:
        query += " AND type = ?"
        params.append(type_filter)
    query += " ORDER BY published_at DESC"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    cursor = await conn.execute(query, params)
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_post_by_slug(conn=None, slug: str = "", locale: str = "en") -> Optional[Dict]:
    """Return a single post by its slug + locale, or None."""
    if conn is None:
        async with get_db() as db:
            return await get_post_by_slug(db, slug=slug, locale=locale)
    cursor = await conn.execute(
        "SELECT * FROM post WHERE slug = ? AND locale = ?",
        (slug, locale),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_guides(conn=None, locale: str = "en") -> List[Dict]:
    """Return all scam guides for ``locale`` ordered by threat level desc."""
    if conn is None:
        async with get_db() as db:
            return await get_guides(db, locale=locale)
    cursor = await conn.execute(
        "SELECT * FROM scam_guide WHERE locale = ? ORDER BY threat_level DESC",
        (locale,),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


async def get_guide_by_slug(conn=None, slug: str = "", locale: str = "en") -> Optional[Dict]:
    """Return a single guide by slug + locale, or None."""
    if conn is None:
        async with get_db() as db:
            return await get_guide_by_slug(db, slug=slug, locale=locale)
    cursor = await conn.execute(
        "SELECT * FROM scam_guide WHERE slug = ? AND locale = ?",
        (slug, locale),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


def _hydrate_module(row) -> Dict:
    """Convert a course_module row into a dict with topics/objectives parsed."""
    mod = dict(row)
    for key, source in (("topics", "topics_json"), ("objectives", "objectives_json")):
        raw = mod.pop(source, None)
        try:
            mod[key] = json.loads(raw) if raw else []
        except (json.JSONDecodeError, TypeError):
            mod[key] = []
    return mod


def _hydrate_lesson(row) -> Dict:
    """Convert a lesson row into a dict with widget config parsed."""
    lesson = dict(row)
    raw = lesson.pop("widget_config_json", None)
    try:
        lesson["widget_config"] = json.loads(raw) if raw else None
    except (json.JSONDecodeError, TypeError):
        lesson["widget_config"] = None
    return lesson


async def get_course_modules(conn=None, locale: str = "en") -> List[Dict]:
    """Return all course modules for the given locale, in order."""
    if conn is None:
        async with get_db() as db:
            return await get_course_modules(db, locale=locale)
    cursor = await conn.execute(
        'SELECT * FROM course_module WHERE locale = ? ORDER BY "order" ASC',
        (locale,),
    )
    rows = await cursor.fetchall()
    return [_hydrate_module(row) for row in rows]


async def get_module_by_slug(conn=None, slug: str = "", locale: str = "en") -> Optional[Dict]:
    """Return a single module by slug + locale, or None."""
    if conn is None:
        async with get_db() as db:
            return await get_module_by_slug(db, slug=slug, locale=locale)
    cursor = await conn.execute(
        "SELECT * FROM course_module WHERE slug = ? AND locale = ?",
        (slug, locale),
    )
    row = await cursor.fetchone()
    return _hydrate_module(row) if row else None


async def get_lessons_for_module(conn=None, module_slug: str = "", locale: str = "en") -> List[Dict]:
    """Return all lessons for a module + locale, in order."""
    if conn is None:
        async with get_db() as db:
            return await get_lessons_for_module(db, module_slug=module_slug, locale=locale)
    cursor = await conn.execute(
        'SELECT * FROM lesson WHERE module_slug = ? AND locale = ? ORDER BY "order" ASC',
        (module_slug, locale),
    )
    rows = await cursor.fetchall()
    return [_hydrate_lesson(row) for row in rows]


async def get_lesson(
    conn=None, module_slug: str = "", lesson_slug: str = "", locale: str = "en"
) -> Optional[Dict]:
    """Return a single lesson by module + lesson slug + locale, or None."""
    if conn is None:
        async with get_db() as db:
            return await get_lesson(
                db, module_slug=module_slug, lesson_slug=lesson_slug, locale=locale
            )
    cursor = await conn.execute(
        "SELECT * FROM lesson WHERE module_slug = ? AND slug = ? AND locale = ?",
        (module_slug, lesson_slug, locale),
    )
    row = await cursor.fetchone()
    return _hydrate_lesson(row) if row else None


async def get_related_posts(
    conn=None,
    post_type: str = "",
    exclude_slug: str = "",
    limit: int = 3,
    locale: str = "en",
) -> List[Dict]:
    """Return related posts of the same type + locale, excluding the current one."""
    if conn is None:
        async with get_db() as db:
            return await get_related_posts(
                db,
                post_type=post_type,
                exclude_slug=exclude_slug,
                limit=limit,
                locale=locale,
            )
    cursor = await conn.execute(
        "SELECT * FROM post WHERE type = ? AND slug != ? AND locale = ? "
        "ORDER BY published_at DESC LIMIT ?",
        (post_type, exclude_slug, locale, limit),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Site search (Task F1)
# ---------------------------------------------------------------------------
# ``content_fts`` is an FTS5 virtual table built by ``seed_data.build_search_index``
# over posts + guides for both locales. Column order is fixed there:
#   0 kind, 1 slug, 2 title, 3 body, 4 lang (UNINDEXED)
# so ``snippet(content_fts, 3, ...)`` highlights the body column.
_FTS_BODY_COL = 3

# Markers the snippet wraps matched terms with. They are control chars (not HTML)
# so the route/template can HTML-escape the snippet text FIRST and only THEN
# swap the markers for <mark>/</mark> — guaranteeing no raw content angle bracket
# survives unescaped. See routers/api.py ``_snippet_to_html``.
SNIPPET_OPEN = "\x01"
SNIPPET_CLOSE = "\x02"


def _build_match_terms(q: str) -> list[str]:
    """Turn a raw user query into a list of safe FTS5 prefix-match terms.

    Each whitespace-separated term becomes a quoted string literal with a ``*``
    prefix operator: ``"<term>"*``. Any double-quote inside a term is doubled so
    the term stays a single FTS string literal (FTS5 escapes ``"`` by doubling).
    The raw query is therefore NEVER concatenated into the MATCH expression as
    bare syntax — every term is a quoted literal, so query operators, parens, and
    SQL metacharacters in user input are inert.
    """
    terms: list[str] = []
    for raw in q.split():
        token = raw.strip()
        if not token:
            continue
        escaped = token.replace('"', '""')
        terms.append(f'"{escaped}"*')
    return terms


async def search_content(
    conn,
    q: str,
    kind: Optional[str] = None,
    limit: int = 10,
    lang: str = "en",
) -> List[Dict]:
    """Full-text search over posts + guides for ``lang``.

    Returns rows ``{kind, slug, title, snippet_raw}`` where ``snippet_raw`` still
    carries the ``\\x01``/``\\x02`` highlight markers — the caller escapes-then-marks.

    Query safety: the user text is split into terms and each term is emitted as a
    quoted FTS string literal (see ``_build_match_terms``); the raw query is never
    spliced into the MATCH string. ``lang`` (and optional ``kind``) are bound
    parameters in the WHERE clause.

    When ``config.SEARCH_ENABLED`` is False (FTS5 unavailable) this falls back to
    a ``LIKE`` scan over title+body with the same return shape (no markers).
    """
    terms = _build_match_terms(q)
    if not terms:
        return []
    limit = max(1, min(limit, 20))

    if config.SEARCH_ENABLED:
        match_expr = " ".join(terms)
        sql = (
            "SELECT kind, slug, title, "
            f"snippet(content_fts, {_FTS_BODY_COL}, ?, ?, '…', 12) AS snippet_raw "
            "FROM content_fts "
            "WHERE content_fts MATCH ? AND lang = ?"
        )
        params: list = [SNIPPET_OPEN, SNIPPET_CLOSE, match_expr, lang]
        if kind in ("post", "guide"):
            sql += " AND kind = ?"
            params.append(kind)
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)
        cursor = await conn.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    # Fallback: FTS5 not compiled in (content_fts wasn't built). LIKE scan over
    # the source tables' title + body text instead. Each term must match (AND
    # semantics, like the prefix MATCH above). Snippet markers are absent here —
    # the route still escape-then-marks, which is a no-op without markers.
    needles: list[str] = []
    for raw in q.split():
        token = raw.strip()
        if token:
            needles.append(f"%{token}%")
    if not needles:
        return []

    def _like_block(kind_literal: str, body_cols: tuple[str, ...]) -> tuple[str, list]:
        # body = title + the extra text columns, lower-cased compare via LIKE.
        haystack = " || ' ' || ".join(("title",) + tuple(f"COALESCE({c},'')" for c in body_cols))
        clauses = " AND ".join([f"({haystack}) LIKE ?"] * len(needles))
        sql_block = (
            f"SELECT '{kind_literal}' AS kind, slug, title, "
            f"substr(COALESCE({body_cols[-1]}, ''), 1, 160) AS snippet_raw "
            f"FROM {'post' if kind_literal == 'post' else 'scam_guide'} "
            f"WHERE locale = ? AND {clauses}"
        )
        return sql_block, [lang, *needles]

    blocks: list[tuple[str, list]] = []
    if kind in (None, "post"):
        blocks.append(_like_block("post", ("subtitle", "content")))
    if kind in (None, "guide"):
        blocks.append(_like_block("guide", ("description", "content")))

    union_sql = " UNION ALL ".join(b[0] for b in blocks) + " LIMIT ?"
    union_params: list = []
    for b in blocks:
        union_params.extend(b[1])
    union_params.append(limit)
    try:
        cursor = await conn.execute(union_sql, union_params)
        rows = await cursor.fetchall()
    except Exception:
        return []
    return [dict(row) for row in rows]


async def get_related_guides(
    conn=None, exclude_slug: str = "", limit: int = 9, locale: str = "en"
) -> List[Dict]:
    """Return other guides for ``locale`` excluding the current one."""
    if conn is None:
        async with get_db() as db:
            return await get_related_guides(
                db, exclude_slug=exclude_slug, limit=limit, locale=locale
            )
    cursor = await conn.execute(
        "SELECT * FROM scam_guide WHERE slug != ? AND locale = ? "
        "ORDER BY threat_level DESC LIMIT ?",
        (exclude_slug, locale, limit),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
