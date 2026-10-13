"""Targeted, reversible publication of site copy edits. No user-state table writes.

Production runs with SEED_ON_STARTUP=false, so a new image does not refresh DB-derived
content. Run inside the deployed container, where /app/content and /app/data are mounted.
It updates three things, all as exact (slug, locale) rows:
  * scam_guide    - every row a reseed would insert from content/guides (all columns);
  * course_module - every row a reseed would insert from seed_data.COURSE_MODULES;
  * post          - only the rows named in the mapping file, title and content only.
A dry run prints only counts. --apply snapshots the old rows, updates them and rebuilds
content_fts inside ONE BEGIN IMMEDIATE transaction; --restore reverses a named snapshot the
same way. Row text is never printed. lesson, sync_blob and every other table are never written.

Mapping (backend/site-sync-20261021.json): old_content_sha256 is
hashlib.sha256(post.content.encode('utf-8')).hexdigest() of the row now in production.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile
from urllib.parse import quote

import config
import database
import seed_data

MIGRATION = 'site-copy-20261021'
KIND = 'site-editorial-before'
DEFAULT_MAPPING = Path(__file__).resolve().parent / 'site-sync-20261021.json'
POST_DIRS = ('interviews', 'newsletters', 'articles')
KEYS = ('slug', 'locale')
FIELDS = {
    'scam_guide': ('title', 'description', 'content', 'icon', 'threat_level', 'category', 'published_at',
                   'source_scope', 'source_catalogued_at', 'sources_json'),
    'course_module': ('order', 'title', 'description', 'content', 'is_locked', 'icon', 'duration', 'lessons',
                      'difficulty', 'topics_json', 'objectives_json', 'accent'),
    'post': ('title', 'content'),
}
LABEL = {'scam_guide': 'guides', 'course_module': 'modules', 'post': 'posts'}
# The INSERTs below mirror seed_data._reseed_content; rows are built in a scratch in-memory
# database with the production schema so column affinity matches a real reseed exactly.
GUIDE_INSERT = ('INSERT INTO scam_guide (slug, locale, title, description, content, icon, threat_level, category, '
                'published_at, source_scope, source_catalogued_at, sources_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
MODULE_INSERT = ('INSERT INTO course_module (slug, locale, "order", title, description, content, is_locked, icon, '
                 'duration, lessons, difficulty, topics_json, objectives_json, accent) '
                 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
POST_INSERT = ('INSERT INTO post (slug, locale, title, subtitle, type, content, cover_image, published_at) '
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?)')


def _q(name: str) -> str:
    return '"' + name + '"'


def connect(db: Path, writable: bool) -> sqlite3.Connection:
    """Open an EXISTING database; never create one. Autocommit mode, explicit transactions."""
    if not db.is_file():
        raise FileNotFoundError(f'Database does not exist: {db}')
    uri = f'file:{quote(str(db.resolve()))}?mode={"rw" if writable else "ro"}'
    conn = sqlite3.connect(uri, uri=True, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    return conn


def db_rows(conn: sqlite3.Connection, table: str) -> dict[tuple[str, str], dict]:
    columns = ', '.join(_q(c) for c in ('id',) + KEYS + FIELDS[table])
    raw = conn.execute(f'SELECT {columns} FROM {_q(table)}').fetchall()
    return {(r['slug'], r['locale']): dict(r) for r in raw}


@contextmanager
def _guide_provenance_under(content_dir: Path):
    """seed_data resolves the provenance catalogue from its import-time CONTENT_DIR."""
    original = seed_data.GUIDE_PROVENANCE_PATH
    seed_data.GUIDE_PROVENANCE_PATH = content_dir / 'provenance' / 'guide-sources.json'
    try:
        yield
    finally:
        seed_data.GUIDE_PROVENANCE_PATH = original


def authored_rows(content_dir: Path) -> dict[str, dict[tuple[str, str], dict]]:
    """The rows a reseed of ``content_dir`` + COURSE_MODULES would hold, without ids."""
    scratch = sqlite3.connect(':memory:')
    scratch.row_factory = sqlite3.Row
    try:
        scratch.executescript(database.SQL_CREATE_TABLES)
        with _guide_provenance_under(content_dir):
            guide_rows = seed_data.load_markdown_files(content_dir / 'guides')
            catalogued_at, catalogue = seed_data.load_guide_provenance(
                {str(meta.get('slug', '')) for meta, _, _ in guide_rows})
            for meta, content, locale in guide_rows:
                slug = meta.get('slug', '')
                icon = seed_data.SCAM_GUIDE_ICONS.get(slug, meta.get('icon', ''))
                scope, scope_date, sources_json = seed_data.guide_provenance_for_locale(
                    catalogue, catalogued_at, slug, locale)
                scratch.execute(GUIDE_INSERT, (
                    slug, locale, meta.get('title', ''), meta.get('description', ''), content, icon,
                    meta.get('threat_level', 3), meta.get('category', ''), meta.get('published_at', ''),
                    scope, scope_date, sources_json))
        for subdir in POST_DIRS:
            for meta, content, locale in seed_data.load_markdown_files(content_dir / subdir):
                scratch.execute(POST_INSERT, (
                    meta.get('slug', ''), locale, meta.get('title', ''), meta.get('subtitle', ''),
                    meta.get('type', subdir.rstrip('s')), content, meta.get('cover_image', ''),
                    meta.get('published_at', '')))
        for module in seed_data.COURSE_MODULES:
            for locale, tr in module['translations'].items():
                scratch.execute(MODULE_INSERT, (
                    module['slug'], locale, module['order'], tr['title'], tr['description'], tr['content'],
                    module['is_locked'], module.get('icon', ''), module.get('duration', ''),
                    module.get('lessons', 0), tr.get('difficulty', module.get('difficulty', '')),
                    json.dumps(tr.get('topics', []), ensure_ascii=False),
                    json.dumps(tr.get('objectives', []), ensure_ascii=False), module.get('accent', 'cyan')))
        rows = {table: {key: {f: row[f] for f in FIELDS[table]} for key, row in db_rows(scratch, table).items()}
                for table in FIELDS}
    except sqlite3.IntegrityError as exc:
        raise ValueError(f'Authored content violates a table constraint: {exc}') from exc
    finally:
        scratch.close()
    if not rows['scam_guide'] or not rows['course_module']:
        raise ValueError('Authored guide and module sets must not be empty')
    return rows


def load_mapping(path: Path) -> dict[tuple[str, str], tuple[str, str]]:
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('migration') != MIGRATION or not isinstance(data.get('posts'), list):
        raise ValueError(f'Invalid site sync mapping: {path}')
    guards: dict[tuple[str, str], tuple[str, str]] = {}
    for item in data['posts']:
        if (not isinstance(item, dict) or not {'slug', 'locale', 'old_title', 'old_content_sha256'} <= set(item)
                or not all(isinstance(item[k], str) for k in ('slug', 'locale', 'old_title', 'old_content_sha256'))
                or item['locale'] not in seed_data.SUPPORTED_LOCALES or not item['slug']
                or not re.fullmatch(r'[0-9a-f]{64}', item['old_content_sha256'])):
            raise ValueError('Invalid post entry in site sync mapping')
        key = (item['slug'], item['locale'])
        if key in guards:
            raise ValueError(f'Duplicate post in site sync mapping: {key}')
        guards[key] = (item['old_title'], item['old_content_sha256'])
    return guards


def plan(conn: sqlite3.Connection, expected: dict, guards: dict) -> tuple[dict, dict]:
    """Return (before rows per table, sorted changed keys per table); raise on any unexpected state."""
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not set(FIELDS) <= names:
        raise ValueError(f'Database is missing tables: {sorted(set(FIELDS) - names)}')
    before = {table: db_rows(conn, table) for table in FIELDS}
    changed = {}
    for table in ('scam_guide', 'course_module'):
        have, want = before[table], expected[table]
        if set(have) != set(want):
            raise ValueError(f'DB {table} key mismatch: missing={sorted(set(want) - set(have))}, '
                             f'extra={sorted(set(have) - set(want))}')
        changed[table] = sorted(k for k in want if any(have[k][f] != want[k][f] for f in FIELDS[table]))
    changed['post'] = []
    for key in sorted(guards):
        old_title, old_sha = guards[key]
        if key not in expected['post']:
            raise ValueError(f'Mapped post missing from content files: {key}')
        if key not in before['post']:
            raise ValueError(f'Mapped post missing from DB: {key}')
        have, want = before['post'][key], expected['post'][key]
        if (have['title'], have['content']) == (want['title'], want['content']):
            continue  # already the new text
        if have['title'] == old_title and hashlib.sha256((have['content'] or '').encode('utf-8')).hexdigest() == old_sha:
            changed['post'].append(key)
        else:
            raise ValueError(f'Post row changed since the editorial baseline: {key}; no update allowed')
    return before, changed


def _counts(changed: dict) -> dict:
    out = {f'changed_{LABEL[t]}': len(keys) for t, keys in changed.items()}
    return {'changed': sum(out.values()), **out}


class _SyncAsDb:
    """Just enough of aiosqlite for seed_data.build_search_index to run on OUR transaction."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    async def execute(self, sql, params=()):
        return _SyncAsCursor(self._conn.execute(sql, params))


class _SyncAsCursor:
    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor

    async def fetchall(self):
        return self._cursor.fetchall()


def _rebuild_fts(conn: sqlite3.Connection) -> None:
    """Run the seeder's own build_search_index synchronously inside the open transaction.

    The shim never suspends, so one send() drives the coroutine to completion without an
    event loop; any real suspension would be a bug and is refused.
    """
    coro = seed_data.build_search_index(_SyncAsDb(conn))
    try:
        coro.send(None)
    except StopIteration:
        return
    coro.close()
    raise RuntimeError('FTS rebuild unexpectedly suspended')


def _write(conn: sqlite3.Connection, table: str, row: dict) -> None:
    sets = ', '.join(f'{_q(f)}=?' for f in FIELDS[table])
    cursor = conn.execute(f'UPDATE {_q(table)} SET {sets} WHERE id=? AND slug=? AND locale=?',
                          tuple(row[f] for f in FIELDS[table]) + (row['id'], row['slug'], row['locale']))
    if cursor.rowcount != 1:
        raise ValueError(f'Update touched {cursor.rowcount} rows: {table} {row["slug"]}/{row["locale"]}')


def _verify(conn: sqlite3.Connection, before: dict, targets: dict) -> None:
    """Only the target rows changed, to exactly the target values; the FTS index matches the rows."""
    for table in FIELDS:
        after = db_rows(conn, table)
        if set(after) != set(before[table]):
            raise ValueError(f'Row set changed unexpectedly: {table}')
        for key, row in after.items():
            want = targets.get(table, {}).get(key)
            expected = {**before[table][key], **{f: want[f] for f in FIELDS[table]}} if want else before[table][key]
            if row != expected:
                raise ValueError(f'Unexpected row state after update: {table} {key}')
    if conn.execute("SELECT 1 FROM sqlite_master WHERE name='content_fts'").fetchone():
        indexed = conn.execute('SELECT COUNT(*) FROM content_fts').fetchone()[0]
        if indexed != len(before['post']) + len(before['scam_guide']):
            raise ValueError('Search index row count differs from post + guide rows')


def snapshot_digest(payload: dict) -> str:
    core = {key: value for key, value in payload.items() if key != 'sha256'}
    encoded = json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def snapshot_identity(path: Path, fd: int, original: os.stat_result, expected_sha256: str) -> None:
    """Bind a commit to the snapshot contents, not only mutable file metadata."""
    held = os.fstat(fd)
    on_path = os.stat(path, follow_symlinks=False)
    for now in (held, on_path):
        if (not stat.S_ISREG(now.st_mode) or stat.S_IMODE(now.st_mode) != 0o600
                or now.st_uid != os.getuid()
                or (now.st_dev, now.st_ino, now.st_size, now.st_mtime_ns)
                != (original.st_dev, original.st_ino, original.st_size, original.st_mtime_ns)):
            raise ValueError(f'Site snapshot changed during update: {path}')
    try:
        candidate = json.loads(os.pread(fd, held.st_size, 0))
    except (OSError, ValueError) as exc:
        raise ValueError(f'Site snapshot changed during update: {path}') from exc
    if (not isinstance(candidate, dict) or candidate.get('sha256') != expected_sha256
            or snapshot_digest(candidate) != expected_sha256):
        raise ValueError(f'Site snapshot changed during update: {path}')


def open_snapshot(path: Path) -> tuple[dict, int, os.stat_result]:
    """Read a regular 0600 snapshot through one no-follow descriptor."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError as exc:
        raise ValueError(f'Unsafe site snapshot: {path}') from exc
    try:
        metadata = os.fstat(fd)
        if (not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600
                or metadata.st_uid != os.getuid()):
            raise ValueError(f'Unsafe site snapshot: {path}')
        with os.fdopen(os.dup(fd), 'r', encoding='utf-8') as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict) or payload.get('sha256') != snapshot_digest(payload):
            raise ValueError(f'Site snapshot checksum differs: {path}')
        snapshot_identity(path, fd, metadata, payload['sha256'])
        return payload, fd, metadata
    except BaseException:
        os.close(fd)
        raise


def snapshot_atomically(snapshot_path: Path, payload: dict) -> tuple[int, os.stat_result]:
    snapshot_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    parent = snapshot_path.parent.lstat()
    if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
            or stat.S_IMODE(parent.st_mode) != 0o700):
        raise ValueError(f'Unsafe site snapshot directory: {snapshot_path.parent}')
    payload = {**payload, 'sha256': snapshot_digest(payload)}
    # Never reuse a prior file: even an internally valid checksum cannot authenticate
    # metadata that another owner-UID process changed between attempts.
    if snapshot_path.exists() or snapshot_path.is_symlink():
        raise FileExistsError(f'Site snapshot already exists: {snapshot_path}')
    fd, temp = tempfile.mkstemp(prefix='.site-snapshot-', dir=snapshot_path.parent)
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
    actual, fd, metadata = open_snapshot(snapshot_path)
    if actual != payload:
        os.close(fd)
        raise ValueError(f'New site snapshot differs from intended update: {snapshot_path}')
    return fd, metadata


def _index(table: str, rows: object) -> dict[tuple[str, str], dict]:
    if not isinstance(rows, list) or not rows:
        raise ValueError('Not a site editorial snapshot')
    index = {}
    for row in rows:
        if not isinstance(row, dict) or not set(('id',) + KEYS + FIELDS[table]) <= set(row) or not isinstance(row['id'], int):
            raise ValueError('Not a site editorial snapshot')
        key = (row['slug'], row['locale'])
        if key in index:
            raise ValueError('Snapshot has duplicate rows')
        index[key] = row
    return index


def parse_snapshot(payload: dict) -> tuple[dict, dict]:
    rows, applied = payload.get('rows'), payload.get('applied_rows')
    if (payload.get('kind') != KIND or payload.get('migration') != MIGRATION
            or not isinstance(rows, dict) or not isinstance(applied, dict) or not rows
            or set(rows) != set(applied) or not set(rows) <= set(FIELDS)):
        raise ValueError('Not a site editorial snapshot')
    originals = {table: _index(table, rows[table]) for table in rows}
    after = {table: _index(table, applied[table]) for table in rows}
    for table in originals:
        if set(originals[table]) != set(after[table]) or any(
                originals[table][k]['id'] != after[table][k]['id'] for k in originals[table]):
            raise ValueError('Snapshot has duplicate or missing rows')
    return originals, after


def row_state(originals: dict, applied: dict, current: dict) -> str:
    for table, rows in originals.items():
        for key, row in rows.items():
            if key not in current[table] or current[table][key]['id'] != row['id']:
                raise ValueError(f'Snapshot row identity differs: {table} {key}')
    def matches(side: dict) -> bool:
        return all(current[t][k][f] == row[f] for t, rows in side.items() for k, row in rows.items() for f in FIELDS[t])
    if matches(originals): return 'original'
    if matches(applied): return 'applied'
    raise ValueError('Editorial rows changed since apply; restore refused')


def status(db: Path, snapshot: Path) -> str:
    """Reconcile one attempt without modifying rows or printing their content."""
    if not snapshot.exists() and not snapshot.is_symlink():
        return 'absent'
    payload, fd, metadata = open_snapshot(snapshot)
    try:
        originals, applied = parse_snapshot(payload)
        conn = connect(db, False)
        try:
            conn.execute('BEGIN')
            state = row_state(originals, applied, {t: db_rows(conn, t) for t in originals})
            snapshot_identity(snapshot, fd, metadata, payload['sha256'])
            conn.execute('ROLLBACK')
            return state
        finally:
            conn.close()
    finally:
        os.close(fd)


def dry_run(db: Path, content_dir: Path, mapping: Path) -> dict:
    expected, guards = authored_rows(content_dir), load_mapping(mapping)
    conn = connect(db, False)
    try:
        conn.execute('BEGIN')
        _, changed = plan(conn, expected, guards)
        conn.execute('ROLLBACK')
    finally:
        conn.close()
    return {'guides': len(expected['scam_guide']), 'modules': len(expected['course_module']),
            'posts_mapped': len(guards), **_counts(changed), 'applied': False}


def apply(db: Path, content_dir: Path, mapping: Path, snapshot: Path) -> dict:
    expected, guards = authored_rows(content_dir), load_mapping(mapping)
    conn = connect(db, True)
    try:
        conn.execute('BEGIN IMMEDIATE')
        try:
            before, changed = plan(conn, expected, guards)
            if not any(changed.values()):
                conn.execute('ROLLBACK')
                return {**_counts(changed), 'snapshot': None}
            applied = {t: {k: {**{c: before[t][k][c] for c in ('id',) + KEYS}, **expected[t][k]} for k in keys}
                       for t, keys in changed.items() if keys}
            payload = {'kind': KIND, 'migration': MIGRATION, 'created_at': datetime.now(timezone.utc).isoformat(),
                       'rows': {t: [before[t][k] for k in changed[t]] for t in applied},
                       'applied_rows': {t: [applied[t][k] for k in changed[t]] for t in applied}}
            snapshot_fd, snapshot_metadata = snapshot_atomically(snapshot, payload)
            try:
                for t in applied:
                    for key in changed[t]:
                        _write(conn, t, applied[t][key])
                _rebuild_fts(conn)
                _verify(conn, before, applied)
                snapshot_identity(snapshot, snapshot_fd, snapshot_metadata, snapshot_digest(payload))
                conn.execute('COMMIT')
            finally:
                os.close(snapshot_fd)
        except BaseException:
            if conn.in_transaction: conn.execute('ROLLBACK')
            raise
    finally:
        conn.close()
    return {**_counts(changed), 'snapshot': str(snapshot)}


def restore(db: Path, snapshot: Path) -> dict:
    payload, snapshot_fd, snapshot_metadata = open_snapshot(snapshot)
    try:
        originals, applied = parse_snapshot(payload)
        conn = connect(db, True)
        try:
            conn.execute('BEGIN IMMEDIATE')
            try:
                state = row_state(originals, applied, {t: db_rows(conn, t) for t in originals})
                if state == 'original':
                    # A command can exit nonzero after SQLite committed or after an earlier
                    # restore. Only these exact original rows are already safe.
                    snapshot_identity(snapshot, snapshot_fd, snapshot_metadata, payload['sha256'])
                    conn.execute('ROLLBACK')
                    return {'restored': 0, 'snapshot': str(snapshot), 'state': 'already-original'}
                before = {t: db_rows(conn, t) for t in FIELDS}
                for t, rows in originals.items():
                    for key in sorted(rows):
                        _write(conn, t, rows[key])
                _rebuild_fts(conn)
                _verify(conn, before, originals)
                snapshot_identity(snapshot, snapshot_fd, snapshot_metadata, payload['sha256'])
                conn.execute('COMMIT')
            except BaseException:
                if conn.in_transaction: conn.execute('ROLLBACK')
                raise
        finally:
            conn.close()
    finally:
        os.close(snapshot_fd)
    restored = {f'restored_{LABEL[t]}': len(rows) for t, rows in originals.items()}
    return {'restored': sum(restored.values()), **restored, 'snapshot': str(snapshot)}


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', type=Path, default=Path('/app/data/discammer.db'))
    p.add_argument('--content', type=Path, help='content directory (default: config.CONTENT_DIR)')
    p.add_argument('--mapping', type=Path, default=DEFAULT_MAPPING)
    p.add_argument('--snapshot', type=Path)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--apply', action='store_true')
    group.add_argument('--restore', action='store_true')
    group.add_argument('--status', action='store_true')
    a = p.parse_args(argv)
    if (a.status or a.restore or a.apply) and not a.snapshot:
        p.error('--status, --restore and --apply require --snapshot')
    if a.status:
        print(status(a.db, a.snapshot))
        return
    if a.restore:
        print(json.dumps(restore(a.db, a.snapshot)))
        return
    # Production must keep authored editorial rows stable until this exact-row
    # migration runs. A startup reseed would change them before the snapshot.
    if config.SEED_ON_STARTUP:
        raise RuntimeError('SEED_ON_STARTUP is enabled; refuse site editorial publication')
    content = a.content or config.CONTENT_DIR
    if a.dry_run:
        print(json.dumps(dry_run(a.db, content, a.mapping)))
    else:
        print(json.dumps(apply(a.db, content, a.mapping, a.snapshot)))


if __name__ == '__main__':
    main()
