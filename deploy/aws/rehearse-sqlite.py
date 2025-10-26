#!/usr/bin/env python3
"""Local synthetic WAL/forward-copy/reverse-copy proof. No input path or network.
Not a remote restore, application, SSM, filesystem mount or cryptography test.
"""
import hashlib
import json
import sqlite3
import tempfile
from pathlib import Path
from time import monotonic


def snapshot(source, destination):
    target = sqlite3.connect(destination)
    source.backup(target)
    assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    target.close()


def run():
    start = monotonic()
    with tempfile.TemporaryDirectory(prefix='discammer-synthetic-recovery-') as tmp:
        root = Path(tmp)
        old = sqlite3.connect(root / 'old.db')
        old.execute('PRAGMA journal_mode=WAL')
        old.execute('PRAGMA wal_autocheckpoint=0')
        old.execute('CREATE TABLE sync_blob (blob_id TEXT PRIMARY KEY, ciphertext BLOB NOT NULL)')
        original = b'synthetic-opaque-first-payload'
        latest = b'synthetic-opaque-new-write-on-aws'
        old.execute('INSERT INTO sync_blob VALUES (?, ?)', ('synthetic-only', original))
        old.commit()
        assert (root / 'old.db-wal').stat().st_size > 0
        snapshot(old, root / 'forward.db')
        old.close()  # old writer drained/stopped before new writer starts
        aws = sqlite3.connect(root / 'forward.db')
        assert aws.execute('SELECT ciphertext FROM sync_blob').fetchone()[0] == original
        aws.execute('UPDATE sync_blob SET ciphertext=?', (latest,))
        aws.commit()
        snapshot(aws, root / 'reverse.db')
        aws.close()  # new writer stopped before old writer resumes
        recovered = sqlite3.connect(root / 'reverse.db')
        value = recovered.execute('SELECT ciphertext FROM sync_blob').fetchone()[0]
        assert value == latest and value != original
        assert recovered.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        recovered.close()
        print(json.dumps({'test': 'synthetic SQLite WAL forward and reverse latest-state restore',
                          'passed': True, 'row_count': 1,
                          'latest_payload_sha256': hashlib.sha256(value).hexdigest(),
                          'duration_seconds': round(monotonic() - start, 3),
                          'production_data_used': False}))


if __name__ == '__main__':
    run()
