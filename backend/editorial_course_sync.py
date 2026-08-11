"""Targeted, reversible publication of authored lesson rows. No user-state table writes.

Run inside the deployed container, where /app/content and /app/data are mounted.
A dry run prints only counts; --apply snapshots the old public lesson rows before
updating them in one transaction. --restore reverses a named snapshot.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile

import config
from course_contract import validate_pair, validate_v2

FIELDS = ('order', 'title', 'body_md', 'widget_type', 'widget_config_json', 'est_minutes')
KEYS = ('module_slug', 'slug', 'locale')


def authored_rows(course_dir: Path) -> dict[tuple[str, str, str], dict]:
    rows = {}
    raw_pairs: dict[tuple[str, str], dict[str, dict]] = {}
    for path in sorted(course_dir.glob('*/*.json')):
        stem = path.name.rsplit('.', 2)
        if len(stem) != 3 or stem[-1] != 'json' or stem[-2] not in ('en', 'ru'):
            raise ValueError(f'Unexpected lesson filename: {path}')
        data = json.loads(path.read_text(encoding='utf-8'))
        key = (path.parent.name, stem[0], stem[1])
        if key in rows:
            raise ValueError(f'Duplicate lesson: {key}')
        if data.get('widget_type') == 'course_v2':
            validate_v2(data.get('widget_config'), str(path))
        raw_pairs.setdefault(key[:2], {})[key[2]] = data
        if not isinstance(data.get('body_md'), str) or not data['body_md'].strip():
            raise ValueError(f'Missing lesson explanation: {path}')
        rows[key] = {
            'order': int(data['order']),
            'title': data['title'],
            'body_md': data['body_md'],
            'widget_type': data.get('widget_type'),
            'widget_config_json': json.dumps(data.get('widget_config'), ensure_ascii=False) if data.get('widget_config') else None,
            'est_minutes': int(data.get('est_minutes', 5)),
        }
    if not rows or any(set(pair) != {'en', 'ru'} for pair in raw_pairs.values()):
        raise ValueError('Authored lesson set must contain complete EN/RU pairs')
    for pair, langs in raw_pairs.items():
        validate_pair(langs['en'], langs['ru'], str(pair))
    return rows


def db_rows(conn: sqlite3.Connection) -> dict[tuple[str, str, str], dict]:
    conn.row_factory = sqlite3.Row
    raw = conn.execute('SELECT id, module_slug, slug, locale, "order", title, body_md, widget_type, widget_config_json, est_minutes FROM lesson').fetchall()
    return {(r['module_slug'], r['slug'], r['locale']): dict(r) for r in raw}


def snapshot_digest(payload: dict) -> str:
    core = {key: value for key, value in payload.items() if key != 'sha256'}
    encoded = json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def snapshot_identity(path: Path, fd: int, original: os.stat_result) -> None:
    """Refuse a replaced or modified snapshot before the SQLite commit."""
    held = os.fstat(fd)
    on_path = os.stat(path, follow_symlinks=False)
    for now in (held, on_path):
        if (not stat.S_ISREG(now.st_mode) or stat.S_IMODE(now.st_mode) != 0o600
                or now.st_uid != os.getuid()
                or (now.st_dev, now.st_ino, now.st_size, now.st_mtime_ns)
                != (original.st_dev, original.st_ino, original.st_size, original.st_mtime_ns)):
            raise ValueError(f'Course snapshot changed during update: {path}')


def open_snapshot(path: Path) -> tuple[dict, int, os.stat_result]:
    """Read a regular 0600 snapshot through one no-follow descriptor."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as exc:
        raise ValueError(f'Unsafe course snapshot: {path}') from exc
    try:
        metadata = os.fstat(fd)
        if (not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600
                or metadata.st_uid != os.getuid()):
            raise ValueError(f'Unsafe course snapshot: {path}')
        with os.fdopen(os.dup(fd), 'r', encoding='utf-8') as handle:
            payload = json.load(handle)
        if (not isinstance(payload, dict) or payload.get('kind') != 'course-editorial-before'
                or payload.get('sha256') != snapshot_digest(payload)):
            raise ValueError(f'Course snapshot checksum differs: {path}')
        snapshot_identity(path, fd, metadata)
        return payload, fd, metadata
    except BaseException:
        os.close(fd)
        raise


def snapshot_atomically(snapshot_path: Path, payload: dict) -> tuple[int, os.stat_result]:
    snapshot_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = {**payload, 'sha256': snapshot_digest(payload)}
    # The deploy workflow chooses a new path per GitHub run and attempt. Never
    # reuse a prior file: even an internally valid checksum cannot authenticate
    # metadata that another owner-UID process changed between attempts.
    if snapshot_path.exists() or snapshot_path.is_symlink():
        raise FileExistsError(f'Course snapshot already exists: {snapshot_path}')
    fd, temp = tempfile.mkstemp(prefix='.course-snapshot-', dir=snapshot_path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
            handle.flush(); os.fsync(handle.fileno())
        # link() is exclusive even if another process creates this path after
        # the precheck. A collision stops before any SQLite update.
        os.link(temp, snapshot_path)
        directory_fd = os.open(snapshot_path.parent, os.O_RDONLY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    _, fd, metadata = open_snapshot(snapshot_path)
    return fd, metadata


def apply(db: Path, course_dir: Path, snapshot: Path, expected_count: int = 110) -> dict:
    authored = authored_rows(course_dir)
    if len(authored) != expected_count:
        raise ValueError(f'Expected {expected_count} authored localized lessons; found {len(authored)}')
    with sqlite3.connect(db, timeout=15) as conn:
        conn.execute('BEGIN IMMEDIATE')
        before = db_rows(conn)
        if set(before) != set(authored):
            raise ValueError(f'DB lesson key mismatch: missing={sorted(set(authored)-set(before))}, extra={sorted(set(before)-set(authored))}')
        changed = [key for key in authored if any(before[key][field] != authored[key][field] for field in FIELDS)]
        if not changed:
            conn.rollback()
            return {'changed': 0, 'snapshot': None}
        payload = {'kind': 'course-editorial-before', 'created_at': datetime.now(timezone.utc).isoformat(),
                   'rows': [before[key] for key in changed],
                   'applied_rows': [{**{k: before[key][k] for k in ('id',) + KEYS}, **authored[key]} for key in changed]}
        snapshot_fd, snapshot_metadata = snapshot_atomically(snapshot, payload)
        try:
            for key in changed:
                row = authored[key]
                conn.execute('UPDATE lesson SET "order"=?, title=?, body_md=?, widget_type=?, widget_config_json=?, est_minutes=? WHERE id=? AND module_slug=? AND slug=? AND locale=?',
                    tuple(row[f] for f in FIELDS) + (before[key]['id'],) + key)
            snapshot_identity(snapshot, snapshot_fd, snapshot_metadata)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            os.close(snapshot_fd)
    return {'changed': len(changed), 'snapshot': str(snapshot)}


def restore(db: Path, snapshot: Path) -> dict:
    payload, snapshot_fd, snapshot_metadata = open_snapshot(snapshot)
    try:
        return _restore_verified(db, snapshot, payload, snapshot_fd, snapshot_metadata)
    finally:
        os.close(snapshot_fd)


def _restore_verified(db: Path, snapshot: Path, payload: dict, snapshot_fd: int,
                      snapshot_metadata: os.stat_result) -> dict:
    if (payload.get('kind') != 'course-editorial-before'
            or not isinstance(payload.get('rows'), list)
            or not isinstance(payload.get('applied_rows'), list)
            or len(payload['rows']) != len(payload['applied_rows'])):
        raise ValueError('Not a course editorial snapshot')
    with sqlite3.connect(db, timeout=15) as conn:
        conn.execute('BEGIN IMMEDIATE')
        current = db_rows(conn)
        applied_by_key = {tuple(row[k] for k in KEYS): row for row in payload['applied_rows']}
        if len(applied_by_key) != len(payload['rows']):
            raise ValueError('Snapshot has duplicate or missing applied rows')
        for row in payload['rows']:
            key = tuple(row[k] for k in KEYS)
            if key not in current or current[key]['id'] != row['id']:
                raise ValueError(f'Snapshot row no longer matches DB identity: {key}')
            if key not in applied_by_key or applied_by_key[key]['id'] != row['id']:
                raise ValueError(f'Snapshot applied row identity differs: {key}')
        if all(all(current[tuple(row[k] for k in KEYS)][field] == row[field] for field in FIELDS)
               for row in payload['rows']):
            # A command can exit nonzero after SQLite committed or after an
            # earlier restore. Only these exact original rows are already safe.
            snapshot_identity(snapshot, snapshot_fd, snapshot_metadata)
            conn.rollback()
            return {'restored': 0, 'snapshot': str(snapshot), 'state': 'already-original'}
        for row in payload['rows']:
            key = tuple(row[k] for k in KEYS)
            applied = applied_by_key.get(key)
            if (not applied or applied['id'] != row['id']
                    or any(current[key][field] != applied[field] for field in FIELDS)):
                raise ValueError(f'Editorial row changed since apply; restore refused: {key}')
        for row in payload['rows']:
            key = tuple(row[k] for k in KEYS)
            conn.execute('UPDATE lesson SET "order"=?, title=?, body_md=?, widget_type=?, widget_config_json=?, est_minutes=? WHERE id=? AND module_slug=? AND slug=? AND locale=?',
                tuple(row[f] for f in FIELDS) + (row['id'],) + key)
        snapshot_identity(snapshot, snapshot_fd, snapshot_metadata)
        conn.commit()
    return {'restored': len(payload['rows']), 'snapshot': str(snapshot)}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', type=Path, default=Path('/app/data/discammer.db'))
    p.add_argument('--content', type=Path, default=Path('/app/content/course'))
    p.add_argument('--snapshot', type=Path)
    p.add_argument('--expected-count', type=int, default=110)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--apply', action='store_true')
    group.add_argument('--restore', action='store_true')
    a = p.parse_args()
    if a.restore:
        if not a.snapshot: p.error('--restore requires --snapshot')
        print(json.dumps(restore(a.db, a.snapshot)))
        return
    # Production must keep authored editorial rows stable until this exact-row
    # migration runs. A startup reseed would change them before the snapshot.
    if config.SEED_ON_STARTUP:
        raise RuntimeError('SEED_ON_STARTUP is enabled; refuse course editorial publication')
    authored = authored_rows(a.content)
    if len(authored) != a.expected_count:
        raise ValueError(f'Expected {a.expected_count} authored localized lessons; found {len(authored)}')
    with sqlite3.connect(a.db) as conn:
        before = db_rows(conn)
    if set(before) != set(authored):
        raise ValueError('DB lesson keys differ from authored files; no update allowed')
    changed = sum(any(before[k][f] != authored[k][f] for f in FIELDS) for k in authored)
    if a.dry_run:
        print(json.dumps({'localized_lessons': len(authored), 'changed': changed, 'applied': False}))
    else:
        if not a.snapshot: p.error('--apply requires --snapshot')
        print(json.dumps(apply(a.db, a.content, a.snapshot, a.expected_count)))


if __name__ == '__main__':
    main()
