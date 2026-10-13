"""Site copy publication changes only matched guide/module/mapped-post rows and can be reversed."""
import asyncio
from contextlib import closing
import hashlib
import json
from pathlib import Path
import re
import shutil
import sqlite3
from types import SimpleNamespace

import aiosqlite
import pytest

import config
import database
import editorial_site_sync as sync
import seed_data

CONTENT_TABLES = ('scam_guide', 'course_module', 'post')
USER_TABLES = ('lesson', 'sync_blob')


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def table_rows(db, table):
    order = 'blob_id' if table == 'sync_blob' else 'id'
    with closing(sqlite3.connect(db)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(r) for r in conn.execute(f'SELECT * FROM {table} ORDER BY {order}')]


def fts_rows(db):
    with closing(sqlite3.connect(db)) as conn:
        return sorted(conn.execute('SELECT kind, slug, title, body, lang FROM content_fts').fetchall())


def state(db):
    return {**{t: table_rows(db, t) for t in CONTENT_TABLES + USER_TABLES}, 'fts': fts_rows(db)}


def rebuild_fts_with_seed_code(db):
    """Rebuild content_fts with the seeder's real aiosqlite code path (independent of our shim)."""
    async def run():
        async with aiosqlite.connect(db) as conn:
            await seed_data.build_search_index(conn)
            await conn.commit()
    asyncio.run(run())


@pytest.fixture(scope='module')
def template_db(tmp_path_factory):
    """One real reseed of the current content: the 'fresh seed' every test compares against."""
    folder = tmp_path_factory.mktemp('site-sync-template')
    saved = (config.DATA_DIR, config.DATABASE_PATH, config.SEARCH_ENABLED)
    config.DATA_DIR, config.DATABASE_PATH = folder, folder / 'template.db'
    try:
        asyncio.run(database.init_db())
        asyncio.run(seed_data._reseed_content())
    finally:
        config.DATA_DIR, config.DATABASE_PATH, config.SEARCH_ENABLED = saved
    return folder / 'template.db'


@pytest.fixture()
def world(tmp_path, template_db):
    """A DB in the simulated pre-release state, a mapping for three posts and an unused snapshot path."""
    db = tmp_path / 'site.db'
    with closing(sqlite3.connect(template_db)) as src, closing(sqlite3.connect(db)) as dst:
        src.backup(dst)
    with closing(sqlite3.connect(db)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("INSERT INTO sync_blob VALUES ('private-id', ?, 'then', 'then')", (b'opaque-user-data',))
        conn.execute("UPDATE lesson SET title='Old lesson title' WHERE id=(SELECT MIN(id) FROM lesson)")
        conn.execute("UPDATE scam_guide SET title='Old guide title', content='Old guide body' WHERE slug='phishing' AND locale='en'")
        conn.execute("UPDATE scam_guide SET description='Old guide description' WHERE slug='phishing' AND locale='ru'")
        modules = [r['id'] for r in conn.execute('SELECT id FROM course_module ORDER BY id')]
        conn.execute("UPDATE course_module SET description='Old module description' WHERE id=?", (modules[0],))
        conn.execute("UPDATE course_module SET topics_json='[]' WHERE id=?", (modules[-1],))
        posts = conn.execute('SELECT id, slug, locale, title, content FROM post ORDER BY id LIMIT 4').fetchall()
        # [0] title+content and an unrelated column; [1] title only; [2] edited but NOT mapped; [3] already new
        conn.execute("UPDATE post SET title='Old post title', content='Old post body', cover_image='/old-cover.jpg' WHERE id=?", (posts[0]['id'],))
        conn.execute("UPDATE post SET title='Old second title' WHERE id=?", (posts[1]['id'],))
        conn.execute("UPDATE post SET title='Unmapped old title' WHERE id=?", (posts[2]['id'],))
        conn.commit()
    rebuild_fts_with_seed_code(db)
    mapping = tmp_path / 'mapping.json'
    entries = [
        {'slug': posts[0]['slug'], 'locale': posts[0]['locale'], 'old_title': 'Old post title', 'old_content_sha256': sha('Old post body')},
        {'slug': posts[1]['slug'], 'locale': posts[1]['locale'], 'old_title': 'Old second title', 'old_content_sha256': sha(posts[1]['content'])},
        {'slug': posts[3]['slug'], 'locale': posts[3]['locale'], 'old_title': 'Never in production', 'old_content_sha256': sha('x')},
    ]
    mapping.write_text(json.dumps({'migration': sync.MIGRATION, 'posts': entries}))
    world = SimpleNamespace(db=db, template=template_db, mapping=mapping, entries=entries, posts=posts,
                            content=seed_data.CONTENT_DIR, snapshot=tmp_path / 'snapshots' / 'before.json',
                            tmp=tmp_path, old=state(db))
    for table in CONTENT_TABLES:  # the simulation really differs from a fresh seed
        assert world.old[table] != table_rows(template_db, table)
    return world


def apply_world(w, snapshot=None):
    return sync.apply(w.db, w.content, w.mapping, snapshot or w.snapshot)


def test_dry_run_prints_only_counts_and_writes_nothing(world, monkeypatch, capsys):
    monkeypatch.setattr(config, 'SEED_ON_STARTUP', False)
    sync.main(['--dry-run', '--db', str(world.db), '--content', str(world.content), '--mapping', str(world.mapping)])
    out = capsys.readouterr().out
    assert json.loads(out) == {'guides': 20, 'modules': 18, 'posts_mapped': 3, 'changed': 6, 'changed_guides': 2,
                               'changed_modules': 2, 'changed_posts': 2, 'applied': False}
    assert 'Old ' not in out and 'phishing' not in out.lower()
    assert state(world.db) == world.old
    assert not world.snapshot.parent.exists()


def test_apply_equals_fresh_seed_preserves_other_state_and_restore_is_exact(world):
    assert sync.status(world.db, world.snapshot) == 'absent'
    result = apply_world(world)
    assert result == {'changed': 6, 'changed_guides': 2, 'changed_modules': 2, 'changed_posts': 2, 'snapshot': str(world.snapshot)}
    assert sync.status(world.db, world.snapshot) == 'applied'
    assert world.snapshot.stat().st_mode & 0o777 == 0o600
    assert world.snapshot.parent.stat().st_mode & 0o777 == 0o700
    snapshot = json.loads(world.snapshot.read_text())
    assert snapshot['kind'] == 'site-editorial-before' and snapshot['sha256'] == sync.snapshot_digest(snapshot)

    applied = state(world.db)
    template = state(world.template)
    assert applied['scam_guide'] == template['scam_guide']        # all columns, ids kept
    assert applied['course_module'] == template['course_module']
    changed_ids = {world.posts[0]['id'], world.posts[1]['id']}
    new_posts = {r['id']: r for r in template['post']}
    assert applied['post'] == [
        {**row, 'title': new_posts[row['id']]['title'], 'content': new_posts[row['id']]['content']}
        if row['id'] in changed_ids else row for row in world.old['post']]
    assert [r for r in applied['post'] if r['id'] == world.posts[0]['id']][0]['cover_image'] == '/old-cover.jpg'
    assert [r for r in applied['post'] if r['id'] == world.posts[2]['id']][0]['title'] == 'Unmapped old title'
    assert applied['lesson'] == world.old['lesson'] and applied['sync_blob'] == world.old['sync_blob']
    assert applied['sync_blob'][0]['ciphertext'] == b'opaque-user-data'
    assert [r for r in applied['lesson'] if r['title'] == 'Old lesson title']

    # content_fts is exactly what the seeder's own rebuild yields from the applied rows
    reference = world.tmp / 'reference.db'
    with closing(sqlite3.connect(world.db)) as src, closing(sqlite3.connect(reference)) as dst:
        src.backup(dst)
    rebuild_fts_with_seed_code(reference)
    assert applied['fts'] == fts_rows(reference) != world.old['fts']
    assert [r for r in applied['fts'] if r[0] == 'guide'] == [r for r in template['fts'] if r[0] == 'guide']
    assert not [r for r in applied['fts'] if 'Old guide title' in r[2]]

    # idempotent: nothing left to change, and no new snapshot is written
    again = apply_world(world, world.tmp / 'unused.json')
    assert again == {'changed': 0, 'changed_guides': 0, 'changed_modules': 0, 'changed_posts': 0, 'snapshot': None}
    assert not (world.tmp / 'unused.json').exists() and state(world.db) == applied

    assert sync.restore(world.db, world.snapshot)['restored'] == 6
    assert sync.status(world.db, world.snapshot) == 'original'
    assert state(world.db) == world.old                           # rows and FTS exactly as before
    assert sync.restore(world.db, world.snapshot) == {'restored': 0, 'snapshot': str(world.snapshot), 'state': 'already-original'}
    assert state(world.db) == world.old


def test_cli_roundtrip_prints_counts_only(world, monkeypatch, capsys):
    monkeypatch.setattr(config, 'SEED_ON_STARTUP', False)
    base = ['--db', str(world.db), '--content', str(world.content), '--mapping', str(world.mapping),
            '--snapshot', str(world.snapshot)]
    sync.main(['--apply'] + base)
    assert json.loads(capsys.readouterr().out)['changed'] == 6
    sync.main(['--status'] + base)
    assert capsys.readouterr().out.strip() == 'applied'
    sync.main(['--restore'] + base)
    assert json.loads(capsys.readouterr().out)['restored'] == 6
    sync.main(['--status'] + base)
    assert capsys.readouterr().out.strip() == 'original'
    assert state(world.db) == world.old
    with pytest.raises(SystemExit):
        sync.main(['--apply', '--db', str(world.db)])              # --snapshot is required
    with pytest.raises(SystemExit):
        sync.main(['--apply', '--restore'] + base)                 # mutually exclusive


@pytest.mark.parametrize('flag', ['--dry-run', '--apply'])
def test_cli_refuses_effective_startup_reseed(world, monkeypatch, flag):
    monkeypatch.setattr(config, 'SEED_ON_STARTUP', True)
    with pytest.raises(RuntimeError, match='SEED_ON_STARTUP is enabled'):
        sync.main([flag, '--db', str(world.db), '--mapping', str(world.mapping), '--snapshot', str(world.snapshot)])
    assert state(world.db) == world.old and not world.snapshot.parent.exists()


def test_unexpected_post_value_refuses_the_whole_run(world):
    with closing(sqlite3.connect(world.db)) as conn:
        conn.execute("UPDATE post SET title='Surprise editorial edit' WHERE id=?", (world.posts[1]['id'],))
        conn.commit()
    before = state(world.db)
    with pytest.raises(ValueError, match='changed since the editorial baseline'):
        apply_world(world)
    with pytest.raises(ValueError, match='changed since the editorial baseline'):
        sync.dry_run(world.db, world.content, world.mapping)
    assert state(world.db) == before and not world.snapshot.exists()   # guides/modules untouched too


@pytest.mark.parametrize('table, mutation', [
    ('scam_guide', 'DELETE FROM scam_guide WHERE id=(SELECT MIN(id) FROM scam_guide)'),
    ('course_module', 'DELETE FROM course_module WHERE id=(SELECT MIN(id) FROM course_module)'),
    ('scam_guide', "INSERT INTO scam_guide (slug, locale, title) VALUES ('extra-guide', 'en', 'x')"),
    ('course_module', "INSERT INTO course_module (slug, locale, \"order\", title) VALUES ('extra-module', 'en', 99, 'x')"),
])
def test_key_set_mismatch_refuses_without_snapshot(world, table, mutation):
    with closing(sqlite3.connect(world.db)) as conn:
        conn.execute(mutation)
        conn.commit()
    before = state(world.db)
    with pytest.raises(ValueError, match=f'DB {table} key mismatch'):
        apply_world(world)
    assert state(world.db) == before and not world.snapshot.exists()


def test_mapped_post_must_exist_in_content_files(world):
    entry = {'slug': 'no-such-post', 'locale': 'en', 'old_title': 't', 'old_content_sha256': 'a' * 64}
    world.mapping.write_text(json.dumps({'migration': sync.MIGRATION, 'posts': [entry]}))
    with pytest.raises(ValueError, match='missing from content files'):
        apply_world(world)
    assert state(world.db) == world.old and not world.snapshot.exists()


def test_mapped_post_missing_from_db_refuses(world):
    with closing(sqlite3.connect(world.db)) as conn:
        conn.execute('DELETE FROM post WHERE id=?', (world.posts[0]['id'],))
        conn.commit()
    with pytest.raises(ValueError, match='missing from DB'):
        apply_world(world)
    assert not world.snapshot.exists()


@pytest.mark.parametrize('document', [
    {'migration': 'other', 'posts': []},
    {'migration': sync.MIGRATION, 'posts': {}},
    {'migration': sync.MIGRATION, 'posts': [{'slug': 's', 'locale': 'fr', 'old_title': 't', 'old_content_sha256': 'a' * 64}]},
    {'migration': sync.MIGRATION, 'posts': [{'slug': 's', 'locale': 'en', 'old_title': 't', 'old_content_sha256': 'A' * 64}]},
    {'migration': sync.MIGRATION, 'posts': [{'slug': 's', 'locale': 'en', 'old_title': 't'}]},
    {'migration': sync.MIGRATION, 'posts': [{'slug': 's', 'locale': 'en', 'old_title': 't', 'old_content_sha256': 'a' * 64}] * 2},
])
def test_invalid_mapping_is_refused(world, document):
    world.mapping.write_text(json.dumps(document))
    with pytest.raises(ValueError, match='site sync mapping'):
        apply_world(world)
    assert state(world.db) == world.old


def test_shipped_mapping_lists_the_eight_retitled_posts():
    mapping = sync.load_mapping(sync.DEFAULT_MAPPING)
    assert len(mapping) == 8
    assert {locale for _slug, locale in mapping} == {'en'}
    assert {slug for slug, _locale in mapping} == {
        'ai-on-the-future-educat', 'breakin-the-code', 'digital-twins',
        'the-impact-of-technology', 'ai-creativity', 'the-future-of-work',
        'the-story-of-alex-chen', 'wearable-lots',
    }


def test_tampered_snapshot_refuses_restore_and_status(world):
    apply_world(world)
    applied = state(world.db)
    payload = json.loads(world.snapshot.read_text())
    payload['created_at'] = '2000-01-01T00:00:00+00:00'
    world.snapshot.write_text(json.dumps(payload))                 # sha256 no longer matches
    with pytest.raises(ValueError, match='checksum differs'):
        sync.restore(world.db, world.snapshot)
    with pytest.raises(ValueError, match='checksum differs'):
        sync.status(world.db, world.snapshot)
    assert state(world.db) == applied


def test_unsafe_snapshot_permissions_are_refused(world):
    apply_world(world)
    world.snapshot.chmod(0o644)
    with pytest.raises(ValueError, match='Unsafe site snapshot'):
        sync.restore(world.db, world.snapshot)


def test_existing_snapshot_path_is_never_reused(world):
    world.snapshot.parent.mkdir(mode=0o700)
    world.snapshot.write_text('{}')
    with pytest.raises(FileExistsError, match='already exists'):
        apply_world(world)
    world.snapshot.unlink()
    world.snapshot.symlink_to(world.tmp / 'elsewhere.json')
    with pytest.raises(FileExistsError, match='already exists'):
        apply_world(world)
    assert state(world.db) == world.old and not (world.tmp / 'elsewhere.json').exists()


def test_snapshot_directory_with_app_access_is_refused(world):
    folder = world.tmp / 'open-snapshots'
    folder.mkdir(mode=0o755)
    with pytest.raises(ValueError, match='Unsafe site snapshot directory'):
        apply_world(world, folder / 'before.json')
    assert state(world.db) == world.old and not (folder / 'before.json').exists()


def test_apply_refuses_snapshot_changed_after_exclusive_creation(world, monkeypatch):
    original_link = sync.os.link
    def alter_after_link(source, target):
        original_link(source, target)
        payload = json.loads(Path(target).read_text())
        payload['created_at'] = '2000-01-01T00:00:00+00:00'
        payload['sha256'] = sync.snapshot_digest(payload)
        Path(target).write_text(json.dumps(payload))
    monkeypatch.setattr(sync.os, 'link', alter_after_link)
    with pytest.raises(ValueError, match='differs from intended update'):
        apply_world(world)
    assert state(world.db) == world.old


def test_restore_refuses_to_overwrite_later_editorial_change(world):
    apply_world(world)
    with closing(sqlite3.connect(world.db)) as conn:
        conn.execute("UPDATE scam_guide SET title='Later editorial change' WHERE slug='phishing' AND locale='en'")
        conn.commit()
    later = state(world.db)
    for call in (sync.restore, sync.status):
        with pytest.raises(ValueError, match='changed since apply'):
            call(world.db, world.snapshot)
    assert state(world.db) == later


def test_fts_failure_rolls_back_apply_and_restore_completely(world, monkeypatch):
    async def failing_rebuild(db):
        await db.execute('DROP TABLE content_fts')
        raise RuntimeError('injected FTS failure')

    with monkeypatch.context() as patched:
        patched.setattr(seed_data, 'build_search_index', failing_rebuild)
        with pytest.raises(RuntimeError, match='injected FTS failure'):
            apply_world(world)
    assert state(world.db) == world.old                            # rows AND the dropped FTS table rolled back
    assert world.snapshot.exists() and sync.status(world.db, world.snapshot) == 'original'
    retry = world.tmp / 'snapshots' / 'retry.json'
    assert apply_world(world, retry)['changed'] == 6
    applied = state(world.db)
    with monkeypatch.context() as patched:
        patched.setattr(seed_data, 'build_search_index', failing_rebuild)
        with pytest.raises(RuntimeError, match='injected FTS failure'):
            sync.restore(world.db, retry)
    assert state(world.db) == applied and sync.status(world.db, retry) == 'applied'
    assert sync.restore(world.db, retry)['restored'] == 6
    assert state(world.db) == world.old


def test_update_failure_rolls_back_everything(world):
    with closing(sqlite3.connect(world.db)) as conn:
        conn.execute("CREATE TRIGGER fail_post BEFORE UPDATE ON post BEGIN SELECT RAISE(ABORT, 'injected update failure'); END")
        conn.commit()
    before = state(world.db)
    with pytest.raises(sqlite3.IntegrityError, match='injected update failure'):
        apply_world(world)
    assert state(world.db) == before                               # guide/module rows written first rolled back
    assert sync.status(world.db, world.snapshot) == 'original'


def test_database_must_already_exist(tmp_path, world):
    missing = tmp_path / 'absent.db'
    for call in (lambda: sync.dry_run(missing, world.content, world.mapping),
                 lambda: sync.apply(missing, world.content, world.mapping, world.snapshot),
                 lambda: sync.connect(missing, True)):
        with pytest.raises(FileNotFoundError, match='Database does not exist'):
            call()
    assert not missing.exists()


def test_database_without_content_tables_is_refused(tmp_path, world):
    bare = tmp_path / 'bare.db'
    with closing(sqlite3.connect(bare)) as conn:
        conn.execute('CREATE TABLE post (id INTEGER PRIMARY KEY)')
    with pytest.raises(ValueError, match='missing tables'):
        sync.dry_run(bare, world.content, world.mapping)


def test_content_override_uses_its_own_provenance_catalogue(tmp_path):
    content = tmp_path / 'content'
    for sub in ('guides', 'provenance', *sync.POST_DIRS):
        shutil.copytree(seed_data.CONTENT_DIR / sub, content / sub)
    assert sync.authored_rows(content) == sync.authored_rows(seed_data.CONTENT_DIR)
    guide = content / 'guides' / 'phishing.en.md'
    guide.write_text(re.sub(r'(?m)^title:.*$', 'title: Edited in the override', guide.read_text(encoding='utf-8'), count=1), encoding='utf-8')
    assert sync.authored_rows(content)['scam_guide'][('phishing', 'en')]['title'] == 'Edited in the override'
    original = seed_data.GUIDE_PROVENANCE_PATH
    (content / 'provenance' / 'guide-sources.json').unlink()
    with pytest.raises(ValueError, match='Guide provenance catalogue is missing') as caught:
        sync.authored_rows(content)
    assert str(content) in str(caught.value)
    assert seed_data.GUIDE_PROVENANCE_PATH == original


def test_authored_rows_equal_a_real_reseed(template_db):
    """The scratch-DB row builder matches seed_data._reseed_content column for column."""
    expected = sync.authored_rows(seed_data.CONTENT_DIR)
    with closing(sqlite3.connect(template_db)) as conn:
        conn.row_factory = sqlite3.Row
        for table in CONTENT_TABLES:
            seeded = sync.db_rows(conn, table)
            assert seeded.keys() == expected[table].keys()
            assert {k: {f: v[f] for f in sync.FIELDS[table]} for k, v in seeded.items()} == expected[table]


def test_fallback_mapping_without_posts_publishes_guides_and_modules_only(world):
    """The direct-deploy script retries with an empty post list when a production post differs from the baseline."""
    world.mapping.write_text(json.dumps({'migration': sync.MIGRATION, 'posts': []}))
    result = apply_world(world)
    assert result == {'changed': 4, 'changed_guides': 2, 'changed_modules': 2, 'changed_posts': 0, 'snapshot': str(world.snapshot)}
    applied, template = state(world.db), state(world.template)
    assert applied['scam_guide'] == template['scam_guide'] and applied['course_module'] == template['course_module']
    assert applied['post'] == world.old['post']
    sync.restore(world.db, world.snapshot)
    assert state(world.db) == world.old
