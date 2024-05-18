"""Tests for the unified client-string bundle and the dead-key audit guard.

``get_client_bundle`` ships the ``client`` slice of a locale file to the React
islands. These tests assert RU/EN parity of that bundle and act as a regression
guard against dead (unused) locale keys via the standalone audit in
``scripts/i18n_audit.py``.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# Backend dir is on sys.path via pytest.ini (pythonpath = backend), but be
# defensive so the module imports when run directly too.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from i18n import get_client_bundle


def _flat_keys(bundle: dict) -> set[str]:
    """Flatten a (possibly nested) bundle into dotted leaf paths.

    Handles grouped namespaces like ``analyzer.flags.*`` by recursing to leaves.
    """
    keys: set[str] = set()

    def walk(prefix: str, node) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(f"{prefix}.{key}" if prefix else key, value)
        else:
            keys.add(prefix)

    walk("", bundle)
    return keys


def _assert_all_leaves_nonempty_str(bundle: dict) -> None:
    """Every leaf in the bundle must be a non-empty string."""
    def walk(prefix: str, node) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(f"{prefix}.{key}" if prefix else key, value)
        else:
            assert isinstance(node, str) and node != "", prefix

    walk("", bundle)


def test_client_bundle_parity():
    """EN and RU client bundles expose an identical namespace + key set."""
    en = get_client_bundle("en")
    ru = get_client_bundle("ru")

    assert set(en.keys()) == set(ru.keys()), "namespace sets differ"

    en_keys = _flat_keys(en)
    ru_keys = _flat_keys(ru)
    assert en_keys == ru_keys, (
        "client key sets differ — "
        f"en-only={sorted(en_keys - ru_keys)} ru-only={sorted(ru_keys - en_keys)}"
    )

    # Every shipped leaf value is a non-empty string (EN fills in any RU gap).
    _assert_all_leaves_nonempty_str(en)
    _assert_all_leaves_nonempty_str(ru)


def test_client_bundle_fills_ru_gaps_from_en(monkeypatch):
    """A key missing from RU is back-filled from EN so the bundle is complete."""
    import i18n

    # Drop one RU key in a copy of the translations and confirm EN fills it.
    ru_client = i18n._translations["ru"]["client"]
    original = ru_client["exam"].copy()
    try:
        ru_client["exam"].pop("heading", None)
        ru = get_client_bundle("ru")
        en = get_client_bundle("en")
        assert ru["exam"]["heading"] == en["exam"]["heading"]
    finally:
        ru_client["exam"] = original


def _load_audit():
    """Import scripts/i18n_audit.py by path (it lives outside the package)."""
    audit_path = _BACKEND.parent / "scripts" / "i18n_audit.py"
    spec = importlib.util.spec_from_file_location("i18n_audit", audit_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_no_dead_locale_keys():
    """Every locale key is referenced somewhere (or explicitly allowlisted).

    This is the real regression guard: adding an unused key, or removing the
    last reference to a key, fails here until the key is deleted or allowlisted.
    """
    audit = _load_audit()

    allow = audit.load_allowlist()
    present = audit.present_keys()
    present_client = {k for k in present if k.startswith("client.")}
    present_backend = present - present_client

    backend_hits = audit.backend_used_keys() & present_backend
    client_used = audit.client_used_keys()
    client_hits = client_used & present_client

    used_all = backend_hits | client_hits | (allow & present)
    dead = present - used_all

    assert dead == set(), f"dead locale keys: {sorted(dead)}"

    # No TSX island may reference a client key that isn't in the locale files.
    missing_client = client_used - present_client
    assert missing_client == set(), f"missing client keys: {sorted(missing_client)}"
