"""Resolve hashed Vite asset filenames from the build manifest.

`npm run build` emits `<STATIC_DIR>/.vite/manifest.json` (Rollup manifest).
Filenames are content-hashed (e.g. `js/app-ABC123.js`) — the ONLY cache-busting
mechanism for JS/CSS, so no `?v=` query strings are needed (and must never be
added: a `?v=`-stamped entry URL is what caused the historic React error #321).

`vite_entry()` returns the entry's hashed JS file, its CSS files, and the static
import chunks to `<link rel="modulepreload">`. Dynamic imports (the lazy island
chunks like Plyr) are deliberately excluded from preload so they load on demand.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from config import STATIC_DIR

logger = logging.getLogger(__name__)

_MANIFEST_PATH = STATIC_DIR / ".vite" / "manifest.json"
_ENTRY_SOURCE = "src/main.tsx"

# Module-level memo. Parsed once on first access; tolerant of a missing file so
# the app still boots (returns an empty manifest) if the frontend wasn't built.
_manifest_cache: Optional[dict[str, Any]] = None


def _load_manifest() -> dict[str, Any]:
    """Load + cache the Vite manifest. Missing/invalid file → empty dict."""
    global _manifest_cache
    if _manifest_cache is not None:
        return _manifest_cache
    try:
        with _MANIFEST_PATH.open(encoding="utf-8") as fh:
            _manifest_cache = json.load(fh)
    except FileNotFoundError:
        logger.warning(
            "Vite manifest not found at %s — run `npm run build`. "
            "Serving with empty asset references.",
            _MANIFEST_PATH,
        )
        _manifest_cache = {}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read Vite manifest at %s: %s", _MANIFEST_PATH, exc)
        _manifest_cache = {}
    return _manifest_cache


def _find_entry(manifest: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Locate the entry record (isEntry: true), preferring src/main.tsx."""
    direct = manifest.get(_ENTRY_SOURCE)
    if isinstance(direct, dict) and direct.get("isEntry"):
        return direct
    for record in manifest.values():
        if isinstance(record, dict) and record.get("isEntry"):
            return record
    return None


def vite_entry() -> dict[str, Any]:
    """Resolve the entry asset paths from the manifest.

    Returns a dict with static-dir-relative paths (the template prefixes
    ``/static/``):

        {
          "js": "js/app-ABC123.js",        # entry module (or "" if no manifest)
          "css": ["css/main-DEF456.css"],   # entry stylesheets, in order
          "preload": ["js/chunks/x-789.js"] # static-import chunks → modulepreload
        }

    Dynamic imports (lazy island chunks, e.g. Plyr) are intentionally NOT in
    ``preload`` — they must load on demand only.
    """
    manifest = _load_manifest()
    entry = _find_entry(manifest)
    if entry is None:
        return {"js": "", "css": [], "preload": []}

    js = entry.get("file", "")
    css = list(entry.get("css", []) or [])

    # Static imports are manifest keys (source paths); map each to its output
    # `file`. These are the always-needed chunks → modulepreload. Recurse one
    # level so a shared chunk's own static imports are preloaded too.
    preload: list[str] = []
    seen: set[str] = set()

    def _collect(import_key: str) -> None:
        record = manifest.get(import_key)
        if not isinstance(record, dict):
            return
        file = record.get("file")
        if file and file not in seen:
            seen.add(file)
            preload.append(file)
        for nested in record.get("imports", []) or []:
            _collect(nested)

    for import_key in entry.get("imports", []) or []:
        _collect(import_key)

    return {"js": js, "css": css, "preload": preload}
