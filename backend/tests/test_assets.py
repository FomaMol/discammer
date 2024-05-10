"""Asset wiring tests — the page must reference the hashed Vite entry, never
the old stable `app.js` name, and that entry file must actually serve.

Depends on `vite_entry` being registered as a Jinja global in main.py and on a
fresh `npm run build` having produced `backend/static/.vite/manifest.json`.
"""
from __future__ import annotations

import json

import pytest

from config import STATIC_DIR

_MANIFEST_PATH = STATIC_DIR / ".vite" / "manifest.json"


def _entry_file() -> str:
    """Read the hashed entry JS filename (e.g. 'js/app-ABC123.js') from the
    build manifest, skipping the test if the frontend hasn't been built."""
    if not _MANIFEST_PATH.exists():
        pytest.skip(f"Vite manifest missing at {_MANIFEST_PATH}; run `npm run build`")
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    entry = manifest.get("src/main.tsx")
    if not (isinstance(entry, dict) and entry.get("isEntry")):
        entry = next(
            (r for r in manifest.values() if isinstance(r, dict) and r.get("isEntry")),
            None,
        )
    assert entry, "no isEntry record in Vite manifest"
    file = entry.get("file")
    assert file, "entry record has no 'file'"
    return file


def test_home_references_hashed_entry(client):
    """The home page embeds the manifest's hashed entry JS, not the stale
    stable `app.js` name."""
    entry_file = _entry_file()
    r = client.get("/en/")
    assert r.status_code == 200
    assert f"/static/{entry_file}" in r.text, (
        f"expected hashed entry /static/{entry_file} in home page HTML"
    )
    # The old stable name must be gone — its presence means a `?v=`-stamped
    # double-load could resurface (the React #321 footgun).
    assert "/static/js/app.js" not in r.text, "stale stable app.js name still referenced"


def test_entry_js_is_served(client):
    """The hashed entry file is actually reachable as a JS asset."""
    entry_file = _entry_file()
    r = client.get(f"/static/{entry_file}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        ("application/javascript", "text/javascript")
    )


def test_modulepreload_matches_manifest_static_imports(client):
    """If (and only if) the entry has static-import chunks, they are preloaded
    via <link rel="modulepreload">.

    In the current build the entry (src/main.tsx) has NO static imports —
    React is bundled into the entry chunk and every island is a *dynamic*
    import — so there is correctly nothing to preload. This test asserts the
    template stays in sync with the manifest rather than hard-requiring a tag
    that shouldn't exist: a modulepreload appears here exactly when the entry
    gains a static import chunk.
    """
    if not _MANIFEST_PATH.exists():
        pytest.skip("Vite manifest missing; run `npm run build`")
    manifest = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
    entry = manifest.get("src/main.tsx") or {}
    static_imports = entry.get("imports") or []

    r = client.get("/en/")
    assert r.status_code == 200
    if static_imports:
        assert 'rel="modulepreload"' in r.text
    else:
        # No static imports → no modulepreload tags (dynamic island chunks
        # must NOT be preloaded; e.g. Plyr must stay off the home page).
        assert 'rel="modulepreload"' not in r.text
