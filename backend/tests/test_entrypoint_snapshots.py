"""The serving container must leave course rollback snapshots root-owned."""
import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]


def run_entrypoint(tmp_path: Path, with_snapshot: bool) -> tuple[subprocess.CompletedProcess, str]:
    data = tmp_path / 'data'
    data.mkdir()
    (data / 'discammer.db').write_text('ordinary app data')
    snapshot = data / 'course-release-snapshots'
    if with_snapshot:
        snapshot.mkdir(mode=0o700)
        (snapshot / 'before.json').write_text('rollback snapshot')
    stub_bin = tmp_path / 'bin'
    stub_bin.mkdir()
    (stub_bin / 'chown').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CHOWN_LOG"\n')
    (stub_bin / 'gosu').write_text('#!/bin/sh\nexit 0\n')
    for name in ('chown', 'gosu'):
        (stub_bin / name).chmod(0o755)
    script = tmp_path / 'entrypoint.sh'
    script.write_text((ROOT / 'scripts/docker-entrypoint.sh').read_text().replace('/app/data', str(data)))
    log = tmp_path / 'chown.log'
    result = subprocess.run(['sh', str(script), 'true'], capture_output=True, text=True,
                            env={**os.environ, 'PATH': f'{stub_bin}:{os.environ["PATH"]}',
                                 'CHOWN_LOG': str(log)}, check=False)
    return result, log.read_text() if log.exists() else ''


def test_restart_excludes_course_snapshots_from_recursive_chown(tmp_path):
    result, log = run_entrypoint(tmp_path, with_snapshot=True)
    assert result.returncode == 0, result.stderr
    assert f'{tmp_path}/data/discammer.db' in log
    assert f'{tmp_path}/data/course-release-snapshots' not in log


def test_initial_start_still_repairs_app_data_ownership(tmp_path):
    result, log = run_entrypoint(tmp_path, with_snapshot=False)
    assert result.returncode == 0, result.stderr
    assert f'-R 10001:10001 {tmp_path}/data' in log
