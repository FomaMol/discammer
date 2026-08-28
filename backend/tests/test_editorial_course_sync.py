"""Course publication changes only matched editorial rows and can be reversed."""
from pathlib import Path
import json
import os
import sqlite3
import sys

import pytest

import config
import editorial_course_sync
from editorial_course_sync import apply, db_rows, main, restore, status

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
    assert status(db, snapshot) == 'absent'
    result = apply(db, content, snapshot, expected_count=2)
    assert result['changed'] == 2
    assert status(db, snapshot) == 'applied'
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
    assert status(db, snapshot) == 'original'
    assert restore(db, snapshot)['restored'] == 0
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


def test_apply_refuses_snapshot_directory_with_app_access(tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot_dir = tmp_path / 'course-release-snapshots'
    snapshot_dir.mkdir(mode=0o755)
    snapshot = snapshot_dir / 'before.json'
    with sqlite3.connect(db) as conn:
        before = db_rows(conn)
    with pytest.raises(ValueError, match='Unsafe course snapshot directory'):
        apply(db, content, snapshot, expected_count=2)
    assert not snapshot.exists()
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before


def test_restore_refuses_to_overwrite_later_editorial_change(tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE lesson SET title='Later editorial change' WHERE locale='en'")
    with pytest.raises(ValueError, match='changed since apply'):
        restore(db, snapshot)
    with pytest.raises(ValueError, match='changed since apply'):
        status(db, snapshot)
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT title FROM lesson WHERE locale='en'").fetchone()[0] == 'Later editorial change'
        assert conn.execute("SELECT ciphertext FROM sync_blob").fetchone()[0] == b'opaque-user-data'


def test_publication_cli_refuses_effective_startup_reseed(monkeypatch, tmp_path):
    monkeypatch.setattr(config, 'SEED_ON_STARTUP', True)
    monkeypatch.setattr(sys, 'argv', ['editorial_course_sync.py', '--dry-run',
                                      '--db', str(tmp_path / 'absent.db'),
                                      '--content', str(tmp_path / 'absent-content')])
    with pytest.raises(RuntimeError, match='SEED_ON_STARTUP is enabled'):
        main()


def test_failed_transaction_retries_with_a_new_attempt_snapshot(tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    with sqlite3.connect(db) as conn:
        before = db_rows(conn)
        conn.execute("CREATE TRIGGER fail_course BEFORE UPDATE ON lesson BEGIN SELECT RAISE(ABORT, 'injected update failure'); END")
    with pytest.raises(sqlite3.IntegrityError, match='injected update failure'):
        apply(db, content, snapshot, expected_count=2)
    assert snapshot.exists() and snapshot.stat().st_mode & 0o777 == 0o600
    assert status(db, snapshot) == 'original'
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before
        assert conn.execute("SELECT ciphertext FROM sync_blob").fetchone()[0] == b'opaque-user-data'
        conn.execute('DROP TRIGGER fail_course')
    with pytest.raises(FileExistsError, match='already exists'):
        apply(db, content, snapshot, expected_count=2)
    retry_snapshot = tmp_path / 'before-run-2.json'
    assert apply(db, content, retry_snapshot, expected_count=2)['changed'] == 2
    assert retry_snapshot.stat().st_mode & 0o777 == 0o600
    assert restore(db, retry_snapshot)['restored'] == 2
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before


def test_retry_refuses_snapshot_with_different_prior_rows(tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TRIGGER fail_course BEFORE UPDATE ON lesson BEGIN SELECT RAISE(ABORT, 'injected update failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        conn.execute('DROP TRIGGER fail_course')
        conn.execute("UPDATE lesson SET title='Later editor change' WHERE locale='en'")
    with pytest.raises(FileExistsError, match='already exists'):
        apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT title FROM lesson WHERE locale='en'").fetchone()[0] == 'Later editor change'


def test_retry_refuses_changed_snapshot_metadata(tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TRIGGER fail_course BEFORE UPDATE ON lesson BEGIN SELECT RAISE(ABORT, 'injected update failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        conn.execute('DROP TRIGGER fail_course')
    payload = json.loads(snapshot.read_text())
    payload['created_at'] = '2000-01-01T00:00:00+00:00'
    snapshot.write_text(json.dumps(payload))
    with pytest.raises(FileExistsError, match='already exists'):
        apply(db, content, snapshot, expected_count=2)
    with pytest.raises(ValueError, match='checksum differs'):
        restore(db, snapshot)
    with pytest.raises(ValueError, match='checksum differs'):
        status(db, snapshot)
    payload['sha256'] = editorial_course_sync.snapshot_digest(payload)
    snapshot.write_text(json.dumps(payload))
    with pytest.raises(FileExistsError, match='already exists'):
        apply(db, content, snapshot, expected_count=2)


def test_restore_refuses_snapshot_replaced_during_read(monkeypatch, tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        before = db_rows(conn)
    replacement = tmp_path / 'replacement.json'
    replacement.write_bytes(snapshot.read_bytes())
    replacement.chmod(0o600)
    original_load = json.load
    def swap_after_read(handle):
        payload = original_load(handle)
        snapshot.unlink()
        snapshot.symlink_to(replacement)
        return payload
    monkeypatch.setattr(editorial_course_sync.json, 'load', swap_after_read)
    with pytest.raises(ValueError, match='snapshot changed during update'):
        restore(db, snapshot)
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before


def test_apply_refuses_snapshot_changed_after_exclusive_creation(monkeypatch, tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    with sqlite3.connect(db) as conn:
        before = db_rows(conn)
    original_link = editorial_course_sync.os.link
    def alter_after_link(source, target):
        original_link(source, target)
        path = Path(target)
        payload = json.loads(path.read_text())
        payload['created_at'] = '2000-01-01T00:00:00+00:00'
        payload['sha256'] = editorial_course_sync.snapshot_digest(payload)
        path.write_text(json.dumps(payload))
    monkeypatch.setattr(editorial_course_sync.os, 'link', alter_after_link)
    with pytest.raises(ValueError, match='differs from intended update'):
        apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before


def test_apply_refuses_same_size_same_mtime_snapshot_rewrite(monkeypatch, tmp_path):
    db, content = fixture_db(tmp_path)
    snapshot = tmp_path / 'before.json'
    with sqlite3.connect(db) as conn:
        before = db_rows(conn)
    original_identity = editorial_course_sync.snapshot_identity
    calls = 0

    def rewrite_before_commit(path, fd, metadata, expected_sha256):
        nonlocal calls
        calls += 1
        if calls == 2:
            old_stat = path.stat()
            old_size = old_stat.st_size
            payload = json.loads(path.read_text())
            payload['rows'][0]['title'] = 'Bad title'  # same length as 'Old title'
            payload['sha256'] = editorial_course_sync.snapshot_digest(payload)
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
            assert path.stat().st_size == old_size
            os.utime(path, ns=(old_stat.st_atime_ns, old_stat.st_mtime_ns))
        return original_identity(path, fd, metadata, expected_sha256)

    monkeypatch.setattr(editorial_course_sync, 'snapshot_identity', rewrite_before_commit)
    with pytest.raises(ValueError, match='changed during update'):
        apply(db, content, snapshot, expected_count=2)
    with sqlite3.connect(db) as conn:
        assert db_rows(conn) == before
