"""Reversible two-row Urgency Trap poster correction; never reseed production."""

import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import config


HERE = Path(__file__).resolve().parent
MAPPING = HERE / "urgency-poster-migration-20261020.json"
DEFAULT_BACKUP = config.DATA_DIR / "urgency-poster-backup-20261020-f453.json"


def _spec() -> dict:
    spec = json.loads(MAPPING.read_text())
    assert spec["migration"] == "urgency-trap-poster-20261020-f453"
    assert spec["slug"] == "the-urgency-trap"
    assert spec["new_cover"] == spec["new_poster"]
    assert spec["old_cover"] == spec["old_poster"]
    assert spec["old_cover"] != spec["new_cover"]
    for field, digest in (("old_cover", spec["old_asset_sha256"]), ("new_cover", spec["asset_sha256"])):
        url = spec[field]
        assert url.startswith("/static/images/video-posters/")
        image = HERE / url.removeprefix("/static/").replace("images/", "static/images/", 1)
        assert image.is_file(), image
        assert hashlib.sha256(image.read_bytes()).hexdigest() == digest, image
    return spec


def _rows(db: sqlite3.Connection, slug: str) -> list[dict]:
    rows = db.execute(
        "SELECT id, slug, locale, cover_image, content FROM post WHERE slug=? ORDER BY locale", (slug,)
    ).fetchall()
    result = [dict(row) for row in rows]
    assert len(result) == 2 and {row["locale"] for row in result} == {"en", "ru"}
    return result


def _state(rows: list[dict], spec: dict) -> str:
    states = []
    for row in rows:
        old = (row["cover_image"] == spec["old_cover"]
               and row["content"].count(spec["old_poster"]) == 1
               and spec["new_poster"] not in row["content"])
        new = (row["cover_image"] == spec["new_cover"]
               and row["content"].count(spec["new_poster"]) == 1
               and spec["old_poster"] not in row["content"])
        assert old != new, (row["slug"], row["locale"], "unexpected editorial state")
        states.append("old" if old else "new")
    assert len(set(states)) == 1, "Mixed EN/RU poster state; inspect before retry"
    return states[0]


def _digest(rows: list[dict]) -> str:
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _backup(path: Path, rows: list[dict], spec: dict) -> None:
    snapshot = {"migration": spec["migration"], "saved_at": datetime.now(timezone.utc).isoformat(),
                "rows_sha256": _digest(rows), "rows": rows}
    if path.exists():
        assert _validated_backup(path, spec)["rows_sha256"] == snapshot["rows_sha256"], "Existing backup differs"
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


def _validated_backup(path: Path, spec: dict) -> dict:
    saved = json.loads(path.read_text())
    assert saved["migration"] == spec["migration"]
    assert len(saved["rows"]) == 2
    assert {row["locale"] for row in saved["rows"]} == {"en", "ru"}
    assert all(row["slug"] == spec["slug"] for row in saved["rows"])
    assert saved["rows_sha256"] == _digest(saved["rows"])
    assert _state(saved["rows"], spec) == "old"
    return saved


def status(db_path: Path) -> str:
    spec = _spec()
    db = sqlite3.connect(db_path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        return _state(_rows(db, spec["slug"]), spec)
    finally:
        db.close()


def apply(db_path: Path, backup_path: Path) -> str:
    spec = _spec()
    db = sqlite3.connect(db_path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("BEGIN IMMEDIATE")
        rows = _rows(db, spec["slug"])
        if _state(rows, spec) == "new":
            db.execute("COMMIT")
            return "already applied: 2 post rows"
        _backup(backup_path, rows, spec)
        for row in rows:
            changed = row["content"].replace(spec["old_poster"], spec["new_poster"])
            result = db.execute(
                "UPDATE post SET cover_image=?, content=? WHERE id=? AND cover_image=? AND content=?",
                (spec["new_cover"], changed, row["id"], row["cover_image"], row["content"]),
            )
            assert result.rowcount == 1
        assert _state(_rows(db, spec["slug"]), spec) == "new"
        db.execute("COMMIT")
        return f"applied: 2 post rows; backup {backup_path}"
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


def restore(db_path: Path, backup_path: Path) -> str:
    spec = _spec()
    saved = _validated_backup(backup_path, spec)["rows"]
    db = sqlite3.connect(db_path, timeout=15, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("BEGIN IMMEDIATE")
        current = _rows(db, spec["slug"])
        if _state(current, spec) == "old":
            assert current == saved, "Old state differs from snapshot"
            db.execute("COMMIT")
            return "already restored: 2 post rows"
        by_id = {row["id"]: row for row in current}
        for row in saved:
            now = by_id[row["id"]]
            assert (now["slug"], now["locale"]) == (row["slug"], row["locale"])
            assert now["cover_image"] == spec["new_cover"]
            assert now["content"] == row["content"].replace(spec["old_poster"], spec["new_poster"])
            result = db.execute(
                "UPDATE post SET cover_image=?, content=? WHERE id=? AND cover_image=? AND content=?",
                (row["cover_image"], row["content"], row["id"], now["cover_image"], now["content"]),
            )
            assert result.rowcount == 1
        assert _rows(db, spec["slug"]) == saved
        db.execute("COMMIT")
        return "restored: 2 post rows"
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
    print(apply(args.db, args.backup) if args.command == "apply"
          else restore(args.db, args.backup) if args.command == "restore"
          else status(args.db))
