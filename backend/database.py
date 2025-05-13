import fcntl
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
    source_scope TEXT,
    source_catalogued_at TEXT,
    sources_json TEXT,
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

-- UX-4 · the project's first table of durable USER state, and therefore the
-- first one for which the "drop and reseed" schema strategy used above is
-- data loss rather than a refresh.
--
-- It is deliberately absent from BOTH destructive paths:
--   * seed_database()'s DELETE list (seed_data.py), and
--   * init_db()'s column-drift DROP loop below.
-- Both are hardcoded allowlists over the four derived CONTENT tables, so this
-- table is protected by staying OUT of them — an invariant pinned by
-- tests/test_db_lifecycle.py because absence documents nothing on its own.
-- Never add it to _*_REQUIRED_COLS: that path DROPs on drift and would destroy
-- user progress. Evolving this schema needs a real migration decision instead.
--
-- Contents are AES-GCM ciphertext encrypted by the client under a key derived
-- from a secret that never leaves the browser; the server cannot read them.
CREATE TABLE IF NOT EXISTS sync_blob (
    blob_id TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

-- Supports the TTL sweep's `WHERE last_seen_at < ?` scan.
CREATE INDEX IF NOT EXISTS idx_sync_blob_last_seen ON sync_blob (last_seen_at);
"""

# Columns each table must carry — ``init_db`` drops + recreates a content
# table if the live DB is missing any of them. Safe because all four tables are
# rebuilt from seed on every startup. ``sync_blob`` is USER state, is rebuilt
# from nothing, and MUST NOT be given an entry here — see its schema comment.
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
    "source_scope",
    "source_catalogued_at",
    "sources_json",
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


async def _apply_pragmas(conn) -> None:
    """Apply the per-connection SQLite tuning every connection should share.

    ``journal_mode=WAL`` is the important one: in the default rollback-journal
    mode a single writer (e.g. the startup reseed, or any future write) blocks
    *all* readers, which under concurrency turns into request stalls and the
    intermittent timeouts that read as "the site is down". WAL lets readers run
    concurrently with a writer. It is a persistent property of the DB file, so
    setting it once sticks, but we re-assert it on every connection so a freshly
    recreated DB is always in WAL.

    ``busy_timeout`` makes a connection wait (up to 5s) for a lock instead of
    failing immediately with "database is locked"; ``synchronous=NORMAL`` is the
    safe, faster durability setting recommended with WAL.

    Order matters: ``busy_timeout`` is set FIRST so the subsequent
    ``journal_mode=WAL`` switch (which needs a brief exclusive lock) WAITS for a
    competing connection instead of erroring out — without this, two worker
    processes starting at once race on the very first WAL switch of a fresh DB.
    """
    await conn.execute("PRAGMA busy_timeout=5000")
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA synchronous=NORMAL")


async def init_db() -> None:
    """Initialise the database: ensure the data directory and tables exist.

    All content tables are rebuilt from seed on every startup, so it is safe
    to drop any of them when its column set is out of sync with the current
    schema.

    Serialized across worker processes with an exclusive ``fcntl.flock`` on
    ``DATA_DIR/.init.lock``: under ``uvicorn --workers N`` every worker runs
    this at startup, and the first ``journal_mode=WAL`` switch of a fresh DB
    plus the ``CREATE``/``DROP`` statements need exclusive write access. Without
    the lock the workers race and one dies with "database is locked" (busy_timeout
    alone does not cover the WAL-mode switch). The lock mirrors the one
    ``seed_database`` uses for the reseed; the two locks are taken sequentially
    (init then seed), never nested, so they cannot deadlock. POSIX-only — prod
    is Linux, dev macOS.
    """
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    lock_fd = open(config.DATA_DIR / ".init.lock", "w")
    try:
        fcntl.flock(lock_fd.fileno(), fcntl.LOCK_EX)
        async with aiosqlite.connect(config.DATABASE_PATH) as db:
            await _apply_pragmas(db)
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
    finally:
        fcntl.flock(lock_fd.fileno(), fcntl.LOCK_UN)
        lock_fd.close()


@asynccontextmanager
async def get_db():
    """Async context manager that yields an aiosqlite connection with row_factory."""
    db = await aiosqlite.connect(config.DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    await _apply_pragmas(db)
    try:
        yield db
    finally:
        await db.close()


async def get_conn():
    """FastAPI dependency: one aiosqlite connection per request.

    Opens a single connection, sets ``row_factory`` and applies the shared
    pragmas via ``_apply_pragmas`` (WAL + busy_timeout + synchronous=NORMAL),
    yields it for the lifetime of the request, and closes it on teardown.
    Routes that depend on this and pass the connection into the CRUD helpers
    below therefore open exactly one connection per request instead of one per
    helper call.
    """
    conn = await aiosqlite.connect(config.DATABASE_PATH)
    conn.row_factory = aiosqlite.Row
    await _apply_pragmas(conn)
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
    return [_hydrate_guide(row) for row in rows]


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
    return _hydrate_guide(row) if row else None


def _hydrate_guide(row) -> Dict:
    """Convert a scam-guide row into a public, locale-specific source record.

    ``sources_json`` is editorial metadata generated from the checked-in
    provenance catalogue.  It deliberately describes source scope rather than
    pretending that the guide is a live alert, case record, or investigation.
    Invalid or missing metadata fails closed to an empty list, which the page
    renders as an explicit absence rather than manufacturing a source trail.
    """
    guide = dict(row)
    raw = guide.pop("sources_json", None)
    try:
        sources = json.loads(raw) if raw else []
    except (json.JSONDecodeError, TypeError):
        sources = []
    guide["sources"] = sources if isinstance(sources, list) else []
    return guide


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
