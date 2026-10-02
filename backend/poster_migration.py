"""Reversible, exact-row editorial poster update for the 20 October release.

Production keeps authored post rows in SQLite with SEED_ON_STARTUP=false. A new
image alone therefore leaves old card and player references live. This command
updates only the seven matched videos in both locales after the new image is
healthy. It does not touch user-owned progress or sync data.
"""

import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import config


HERE = Path(__file__).resolve().parent
MAPPING = HERE / "poster-migration-20261020.json"
DEFAULT_BACKUP = config.DATA_DIR / "poster-backup-20261020.json"


def _mapping() -> list[dict]:
    data = json.loads(MAPPING.read_text())
    assert data["migration"] == "video-posters-20261020"
    rows = data["rows"]
    assert len(rows) == 7
    assert len({row["slug"] for row in rows}) == 7
    for row in rows:
        for kind in ("card", "player"):
            url = row[f"new_{'cover' if kind == 'card' else 'poster'}"]
            assert url.startswith("/static/images/video-posters/")
            image = HERE / url.removeprefix("/static/").replace("images/", "static/images/", 1)
            # HERE / "static/images/..." is in the built image and worktree.
            assert image.is_file(), image
            assert hashlib.sha256(image.read_bytes()).hexdigest() == row[f"{kind}_sha256"], image
        if "accepted_successor_cover" in row:
            assert row["accepted_successor_cover"] == row["accepted_successor_poster"]
            successor = HERE / row["accepted_successor_cover"].removeprefix("/static/").replace("images/", "static/images/", 1)
            assert successor.is_file(), successor
            assert hashlib.sha256(successor.read_bytes()).hexdigest() == row["accepted_successor_sha256"]
    return rows


def _select(db: sqlite3.Connection, slugs: list[str]) -> list[dict]:
    placeholders = ",".join("?" for _ in slugs)
    rows = db.execute(
        f"SELECT id, slug, locale, cover_image, content FROM post WHERE slug IN ({placeholders})",
        slugs,
    ).fetchall()
    return sorted((dict(row) for row in rows), key=lambda row: (row["slug"], row["locale"]))


def _row_state(rows: list[dict], by_slug: dict) -> str:
    expected = {(slug, lang) for slug in by_slug for lang in ("en", "ru")}
    assert len(rows) == 14 and {(r["slug"], r["locale"]) for r in rows} == expected
    old_count = new_count = 0
    for row in rows:
        item = by_slug[row["slug"]]
        old = (
            row["cover_image"] == item["old_cover"]
            and row["content"].count(item["old_poster"]) == 1
            # The previous image has no video-posters directory. Even a URL
            # for another mapped video makes an old-image rollback unsafe.
            and "/static/images/video-posters/" not in row["content"]
        )
        accepted_new = [(item["new_cover"], item["new_poster"])]
        if "accepted_successor_cover" in item:
            accepted_new.append((item["accepted_successor_cover"], item["accepted_successor_poster"]))
        new = item["old_poster"] not in row["content"] and any(
            row["cover_image"] == cover
            and row["content"].count(poster) == 1
            and all(other not in row["content"] for _, other in accepted_new if other != poster)
            for cover, poster in accepted_new
        )
        assert old != new, (row["slug"], row["locale"], "unexpected editorial state")
        old_count += old
        new_count += new
    assert (old_count, new_count) in ((14, 0), (0, 14)), "Mixed old/new rows; inspect before retry"
    return "new" if new_count == 14 else "old"


def status(db_path: Path) -> str:
    """Read the exact 14-row state before deciding whether an image can roll back."""
    by_slug = {row["slug"]: row for row in _mapping()}
    db = sqlite3.connect(db_path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("BEGIN")
        result = _row_state(_select(db, list(by_slug)), by_slug)
        db.execute("COMMIT")
        return result
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


def _snapshot(rows: list[dict]) -> dict:
    canonical = json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
    return {
        "migration": "video-posters-20261020",
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "rows_sha256": hashlib.sha256(canonical).hexdigest(),
        "rows": rows,
    }


def _validated_backup(path: Path) -> dict:
    data = json.loads(path.read_text())
    assert data["migration"] == "video-posters-20261020"
    rows = data["rows"]
    assert len(rows) == 14
    canonical = json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
    assert hashlib.sha256(canonical).hexdigest() == data["rows_sha256"]
    return data


def _write_backup(path: Path, snapshot: dict) -> None:
    if path.exists():
        existing = _validated_backup(path)
        assert existing["rows_sha256"] == snapshot["rows_sha256"], "Existing backup differs"
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(snapshot, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def apply(db_path: Path, backup_path: Path) -> str:
    spec = _mapping()
    by_slug = {row["slug"]: row for row in spec}
    db = sqlite3.connect(db_path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("BEGIN IMMEDIATE")
        rows = _select(db, list(by_slug))
        if _row_state(rows, by_slug) == "new":
            db.execute("COMMIT")
            return "already applied: 14 post rows"

        _write_backup(backup_path, _snapshot(rows))
        before_total = db.execute("SELECT COUNT(*) FROM post").fetchone()[0]
        for row in rows:
            item = by_slug[row["slug"]]
            changed = row["content"].replace(item["old_poster"], item["new_poster"])
            result = db.execute(
                "UPDATE post SET cover_image=?, content=? WHERE id=? AND cover_image=? AND content=?",
                (item["new_cover"], changed, row["id"], row["cover_image"], row["content"]),
            )
            assert result.rowcount == 1
        assert db.execute("SELECT COUNT(*) FROM post").fetchone()[0] == before_total
        for row in _select(db, list(by_slug)):
            item = by_slug[row["slug"]]
            assert row["cover_image"] == item["new_cover"]
            assert row["content"].count(item["new_poster"]) == 1
            assert item["old_poster"] not in row["content"]
        db.execute("COMMIT")
        return f"applied: 14 post rows; backup {backup_path}"
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


def restore(db_path: Path, backup_path: Path) -> str:
    spec = _mapping()
    by_slug = {row["slug"]: row for row in spec}
    saved = _validated_backup(backup_path)["rows"]
    expected = {(slug, lang) for slug in by_slug for lang in ("en", "ru")}
    assert {(r["slug"], r["locale"]) for r in saved} == expected
    db = sqlite3.connect(db_path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("BEGIN IMMEDIATE")
        current = _select(db, list(by_slug))
        assert len(current) == 14
        by_id = {row["id"]: row for row in current}
        if all(by_id[row["id"]]["cover_image"] == row["cover_image"] and by_id[row["id"]]["content"] == row["content"] for row in saved):
            db.execute("COMMIT")
            return "already restored: 14 post rows"
        before_total = db.execute("SELECT COUNT(*) FROM post").fetchone()[0]
        for row in saved:
            item = by_slug[row["slug"]]
            now = by_id[row["id"]]
            assert (now["slug"], now["locale"]) == (row["slug"], row["locale"])
            assert now["cover_image"] == item["new_cover"]
            assert now["content"] == row["content"].replace(item["old_poster"], item["new_poster"])
            result = db.execute(
                "UPDATE post SET cover_image=?, content=? WHERE id=? AND cover_image=? AND content=?",
                (row["cover_image"], row["content"], row["id"], now["cover_image"], now["content"]),
            )
            assert result.rowcount == 1
        assert db.execute("SELECT COUNT(*) FROM post").fetchone()[0] == before_total
        db.execute("COMMIT")
        return "restored: 14 post rows"
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("apply", "restore", "status"))
    parser.add_argument("--db", type=Path, default=config.DATABASE_PATH)
    parser.add_argument("--backup", type=Path, default=DEFAULT_BACKUP)
    args = parser.parse_args()
    print(
        apply(args.db, args.backup) if args.command == "apply"
        else restore(args.db, args.backup) if args.command == "restore"
        else status(args.db)
    )
