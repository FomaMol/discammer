"""Course publication changes only matched editorial rows and can be reversed."""
from pathlib import Path
import sqlite3

import pytest

from editorial_course_sync import apply, db_rows, restore

ROOT = Path(__file__).resolve().parents[2]


def fixture_db(tmp_path):
    content = tmp_path / 'content' / 'phishing'
    content.mkdir(parents=True)
    db = tmp_path / 'content.db'
    with sqlite3.connect(db) as conn:
        conn.execute('CREATE TABLE lesson (id INTEGER PRIMARY KEY, module_slug TEXT, slug TEXT, locale TEXT, "order" INTEGER, title TEXT, body_md TEXT, widget_type TEXT, widget_config_json TEXT, est_minutes INTEGER)')
        conn.execute('CREATE TABLE sync_blob (blob_id TEXT PRIMARY KEY, ciphertext BLOB)')
        conn.execute('INSERT INTO sync_blob VALUES (?, ?)', ('private-id', b'opaque-user-data'))
        for i, lang in enumerate(('en', 'ru'), 1):
            source = ROOT / 'content/course/phishing' / f'lookalike-domains.{lang}.json'
            content.joinpath(source.name).write_bytes(source.read_bytes())
            conn.execute('INSERT INTO lesson VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                         (i, 'phishing', 'lookalike-domains', lang, 2, 'Old title', 'Old body', 'quiz', '{}', 7))
    return db, content.parent


def test_targeted_apply_and_restore_preserve_identity_and_user_state(tmp_path):
    db, content = fixture_db(tmp_path)
    with sqlite3.connect(db) as conn: before = db_rows(conn)
    snapshot = tmp_path / 'snapshots' / 'before.json'
    result = apply(db, content, snapshot, expected_count=2)
    assert result['changed'] == 2
    assert snapshot.exists()
    assert snapshot.stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(db) as conn:
        after = db_rows(conn)
        assert conn.execute('SELECT ciphertext FROM sync_blob WHERE blob_id=?', ('private-id',)).fetchone()[0] == b'opaque-user-data'
    assert {row['id'] for row in after.values()} == {1, 2}
    assert all(row['widget_type'] == 'course_v2' for row in after.values())
    assert apply(db, content, tmp_path / 'unused.json', expected_count=2)['changed'] == 0
    assert not (tmp_path / 'unused.json').exists()
    assert restore(db, snapshot)['restored'] == 2
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before
        assert conn.execute('SELECT ciphertext FROM sync_blob').fetchone()[0] == b'opaque-user-data'


def test_missing_db_lesson_aborts_without_snapshot(tmp_path):
    db, content = fixture_db(tmp_path)
    with sqlite3.connect(db) as conn: conn.execute("DELETE FROM lesson WHERE locale='ru'")
    snapshot = tmp_path / 'snapshots' / 'should-not-exist.json'
    with pytest.raises(ValueError, match='mismatch'):
        apply(db, content, snapshot, expected_count=2)
    assert not snapshot.exists()
