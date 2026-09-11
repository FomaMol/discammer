"""The one-time production editorial update stays exact and reversible."""

import sqlite3

import pytest

from poster_migration import _mapping, apply, restore, status


def _db(path):
    db = sqlite3.connect(path)
    db.execute(
        "CREATE TABLE post (id INTEGER PRIMARY KEY, slug TEXT, locale TEXT, "
        "cover_image TEXT, content TEXT)"
    )
    for item in _mapping():
        for locale in ("en", "ru"):
            db.execute(
                "INSERT INTO post (slug, locale, cover_image, content) VALUES (?, ?, ?, ?)",
                (item["slug"], locale, item["old_cover"], f"Before {item['old_poster']} after"),
            )
    db.execute(
        "INSERT INTO post (slug, locale, cover_image, content) VALUES (?, ?, ?, ?)",
        ("unrelated", "en", "untouched", "unchanged"),
    )
    db.commit()
    db.close()


def test_exact_posters_are_snapshotted_updated_and_restored(tmp_path):
    db_path = tmp_path / "editorial.db"
    backup = tmp_path / "poster-backup.json"
    _db(db_path)
    assert status(db_path) == "old"

    assert apply(db_path, backup).startswith("applied: 14 post rows")
    assert status(db_path) == "new"
    assert backup.stat().st_mode & 0o777 == 0o600
    assert apply(db_path, backup) == "already applied: 14 post rows"
    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT COUNT(*) FROM post").fetchone()[0] == 15
        assert db.execute("SELECT cover_image, content FROM post WHERE slug='unrelated'").fetchone() == (
            "untouched", "unchanged"
        )
        for item in _mapping():
            rows = db.execute(
                "SELECT cover_image, content FROM post WHERE slug=?", (item["slug"],)
            ).fetchall()
            assert len(rows) == 2
            assert all(cover == item["new_cover"] and item["new_poster"] in content for cover, content in rows)

    assert restore(db_path, backup) == "restored: 14 post rows"
    assert status(db_path) == "old"
    assert restore(db_path, backup) == "already restored: 14 post rows"
    with sqlite3.connect(db_path) as db:
        for item in _mapping():
            rows = db.execute(
                "SELECT cover_image, content FROM post WHERE slug=?", (item["slug"],)
            ).fetchall()
            assert all(cover == item["old_cover"] and item["old_poster"] in content for cover, content in rows)


def test_unexpected_editorial_state_aborts_without_mutation(tmp_path):
    db_path = tmp_path / "editorial.db"
    backup = tmp_path / "poster-backup.json"
    _db(db_path)
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE post SET cover_image='unexpected' WHERE id=1")
        db.commit()
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        apply(db_path, backup)
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        status(db_path)
    assert not backup.exists()
    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT cover_image FROM post WHERE id=1").fetchone()[0] == "unexpected"


def test_old_row_with_new_poster_url_is_not_a_safe_rollback_state(tmp_path):
    db_path = tmp_path / "editorial.db"
    backup = tmp_path / "poster-backup.json"
    _db(db_path)
    new_poster = _mapping()[0]["new_poster"]
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE post SET content=content || ? WHERE id=1", (f" extra {new_poster}",))
        db.commit()
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        status(db_path)
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        apply(db_path, backup)
    assert not backup.exists()


def test_new_row_with_old_poster_url_is_not_an_exact_new_state(tmp_path):
    db_path = tmp_path / "editorial.db"
    backup = tmp_path / "poster-backup.json"
    _db(db_path)
    assert apply(db_path, backup).startswith("applied: 14 post rows")
    old_poster = _mapping()[0]["old_poster"]
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE post SET content=content || ? WHERE id=1", (f" extra {old_poster}",))
        db.commit()
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        status(db_path)
    with pytest.raises(AssertionError):
        restore(db_path, backup)
    with sqlite3.connect(db_path) as db:
        assert old_poster in db.execute("SELECT content FROM post WHERE id=1").fetchone()[0]
