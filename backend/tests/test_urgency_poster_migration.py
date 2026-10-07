"""The Urgency correction changes only its two stored editorial rows."""

import json
import sqlite3

import pytest

from urgency_poster_migration import _spec, apply, restore, status
from alex_poster_migration import _spec as alex_spec, status as alex_status
from poster_migration import _mapping, status as seven_status


def _db(path):
    urgency = _spec()
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE post (id INTEGER PRIMARY KEY, slug TEXT, locale TEXT, "
            "cover_image TEXT, content TEXT)"
        )
        for item in _mapping():
            for lang in ("en", "ru"):
                content = f"unique {lang} before {item['new_poster']} after"
                db.execute(
                    "INSERT INTO post (slug, locale, cover_image, content) VALUES (?, ?, ?, ?)",
                    (item["slug"], lang, item["new_cover"], content),
                )
        db.execute(
            "INSERT INTO post (slug, locale, cover_image, content) VALUES (?, ?, ?, ?)",
            ("unrelated-user-owned", "en", "custom", "leave this exactly"),
        )
    return urgency


def _all(path):
    with sqlite3.connect(path) as db:
        return db.execute("SELECT id, slug, locale, cover_image, content FROM post ORDER BY id").fetchall()


def test_targeted_revision_snapshot_and_restore_preserve_other_rows(tmp_path):
    db_path, backup = tmp_path / "editorial.db", tmp_path / "snapshot.json"
    urgency = _db(db_path)
    before = _all(db_path)
    assert status(db_path) == "old"
    assert seven_status(db_path) == "new"

    assert apply(db_path, backup).startswith("applied: 2 post rows")
    assert backup.stat().st_mode & 0o777 == 0o600
    assert status(db_path) == "new"
    assert seven_status(db_path) == "new"
    assert apply(db_path, backup) == "already applied: 2 post rows"
    after = _all(db_path)
    assert len(after) == len(before) == 15
    assert [row for row in after if row[1] != urgency["slug"]] == [row for row in before if row[1] != urgency["slug"]]
    assert all(row[3] == urgency["new_cover"] and row[4].count(urgency["new_poster"]) == 1
               for row in after if row[1] == urgency["slug"])
    saved = json.loads(backup.read_text())
    assert saved["migration"] == urgency["migration"] and len(saved["rows"]) == 2

    assert restore(db_path, backup) == "restored: 2 post rows"
    assert _all(db_path) == before
    assert status(db_path) == "old"
    assert restore(db_path, backup) == "already restored: 2 post rows"


def test_mixed_or_unexpected_row_aborts_without_snapshot(tmp_path):
    db_path, backup = tmp_path / "editorial.db", tmp_path / "snapshot.json"
    urgency = _db(db_path)
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE post SET cover_image=? WHERE slug=? AND locale='ru'",
                   (urgency["new_cover"], urgency["slug"]))
    before = _all(db_path)
    with pytest.raises(AssertionError, match="unexpected editorial state"):
        apply(db_path, backup)
    assert _all(db_path) == before
    assert not backup.exists()


def test_restore_refuses_a_post_edit_to_corrected_content(tmp_path):
    db_path, backup = tmp_path / "editorial.db", tmp_path / "snapshot.json"
    urgency = _db(db_path)
    assert apply(db_path, backup).startswith("applied: 2 post rows")
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE post SET content=content || ' later edit' WHERE slug=? AND locale='en'",
                   (urgency["slug"],))
    before = _all(db_path)
    with pytest.raises(AssertionError):
        restore(db_path, backup)
    assert _all(db_path) == before


def test_mixed_locales_abort_and_leave_other_poster_revision_alone(tmp_path):
    db_path, backup = tmp_path / "editorial.db", tmp_path / "snapshot.json"
    urgency = _db(db_path)
    alex = alex_spec()
    with sqlite3.connect(db_path) as db:
        db.execute(
            "UPDATE post SET cover_image=?, content=replace(content, ?, ?) WHERE slug=?",
            (alex["new_cover"], alex["old_poster"], alex["new_poster"], alex["slug"]),
        )
        db.execute(
            "UPDATE post SET cover_image=?, content=replace(content, ?, ?) WHERE slug=? AND locale='ru'",
            (urgency["new_cover"], urgency["old_poster"], urgency["new_poster"], urgency["slug"]),
        )
    before = _all(db_path)
    assert alex_status(db_path) == "new"
    assert seven_status(db_path) == "new"
    with pytest.raises(AssertionError, match="Mixed EN/RU"):
        apply(db_path, backup)
    assert _all(db_path) == before and not backup.exists()


def test_previous_seven_poster_migration_accepts_both_successors(tmp_path):
    db_path, backup = tmp_path / "editorial.db", tmp_path / "snapshot.json"
    urgency = _db(db_path)
    alex = alex_spec()
    with sqlite3.connect(db_path) as db:
        db.execute(
            "UPDATE post SET cover_image=?, content=replace(content, ?, ?) WHERE slug=?",
            (alex["new_cover"], alex["old_poster"], alex["new_poster"], alex["slug"]),
        )
    before = _all(db_path)
    assert apply(db_path, backup).startswith("applied: 2 post rows")
    assert status(db_path) == "new"
    assert alex_status(db_path) == "new"
    assert seven_status(db_path) == "new"
    assert [row for row in _all(db_path) if row[1] != urgency["slug"]] == [
        row for row in before if row[1] != urgency["slug"]
    ]


@pytest.mark.parametrize("lang", ["en", "ru"])
def test_seeded_journal_renders_corrected_card_and_player_for_both_locales(client, lang):
    spec = _spec()
    posts = client.get(f"/api/posts?lang={lang}").json()
    urgency = next(row for row in posts if row["slug"] == spec["slug"])
    assert urgency["cover_image"] == spec["new_cover"]
    page = client.get(f"/{lang}/journal/{spec['slug']}")
    assert page.status_code == 200
    assert page.text.count(spec["new_poster"]) >= 1
    assert spec["old_poster"] not in page.text
    assert 'data-component="VideoPlayer"' in page.text
