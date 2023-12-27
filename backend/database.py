import json
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

import aiosqlite

import config


SQL_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    type TEXT NOT NULL CHECK (type IN ('interview', 'newsletter', 'article')),
    content TEXT,
    cover_image TEXT,
    published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scam_guide (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    icon TEXT,
    threat_level INTEGER,
    category TEXT,
    published_at TEXT
);

CREATE TABLE IF NOT EXISTS course_module (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    accent TEXT
);
"""


async def init_db() -> None:
    """Initialise the database: ensure the data directory and tables exist.

    ``course_module`` is rebuilt from seed on every startup, so it is safe to
    drop here when its column set is out of sync with the current schema —
    this lets new fields (duration, lessons, topics_json, …) be added without
    a manual migration step.
    """
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(config.DATABASE_PATH) as db:
        cursor = await db.execute("PRAGMA table_info(course_module)")
        existing_cols = {row[1] for row in await cursor.fetchall()}
        required_cols = {"icon", "duration", "lessons", "difficulty", "topics_json", "objectives_json", "accent"}
        if existing_cols and not required_cols.issubset(existing_cols):
            await db.execute("DROP TABLE course_module")

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


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

async def get_posts(type_filter: Optional[str] = None, limit: Optional[int] = None) -> List[Dict]:
    """Return posts, optionally filtered by type and limited."""
    async with get_db() as db:
        query = "SELECT * FROM post"
        params: list = []
        if type_filter:
            query += " WHERE type = ?"
            params.append(type_filter)
        query += " ORDER BY published_at DESC"
        if limit:
            query += " LIMIT ?"
            params.append(limit)
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_post_by_slug(slug: str) -> Optional[Dict]:
    """Return a single post by its slug, or None."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM post WHERE slug = ?", (slug,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_guides() -> List[Dict]:
    """Return all scam guides ordered by threat level descending."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM scam_guide ORDER BY threat_level DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_guide_by_slug(slug: str) -> Optional[Dict]:
    """Return a single guide by slug, or None."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM scam_guide WHERE slug = ?", (slug,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def get_course_modules() -> List[Dict]:
    """Return all course modules in order, with topics/objectives parsed from JSON."""
    async with get_db() as db:
        cursor = await db.execute(
            'SELECT * FROM course_module ORDER BY "order" ASC'
        )
        rows = await cursor.fetchall()
        modules = []
        for row in rows:
            mod = dict(row)
            for key, source in (("topics", "topics_json"), ("objectives", "objectives_json")):
                raw = mod.pop(source, None)
                try:
                    mod[key] = json.loads(raw) if raw else []
                except (json.JSONDecodeError, TypeError):
                    mod[key] = []
            modules.append(mod)
        return modules


async def get_related_posts(
    post_type: str, exclude_slug: str, limit: int = 3
) -> List[Dict]:
    """Return related posts of the same type, excluding the current one."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM post WHERE type = ? AND slug != ? "
            "ORDER BY published_at DESC LIMIT ?",
            (post_type, exclude_slug, limit),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_related_guides(exclude_slug: str, limit: int = 9) -> List[Dict]:
    """Return other guides excluding the current one."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM scam_guide WHERE slug != ? "
            "ORDER BY threat_level DESC LIMIT ?",
            (exclude_slug, limit),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
