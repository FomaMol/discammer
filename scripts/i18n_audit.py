#!/usr/bin/env python3
"""i18n key audit for DiScammer.

Builds the set of locale keys that are actually *used* across the two surfaces
that consume them, and compares it against the keys *present* in the locale
files (``backend/locales/{en,ru}.json``). Anything present-but-unused is a dead
key; anything used-but-missing is a broken reference.

Surfaces
--------
backend  Server-rendered Jinja templates (``backend/templates/**/*.html``) and
         Python route/handler code (``backend/**/*.py``) call ``t(lang, 'a.b')``
         / ``t_list(lang, 'a.b')``. Top-level dotted keys live at the root of
         the locale files (``home.*``, ``guide.*``, ``page_titles.*`` …).

client   React islands (``frontend/src/**/*.tsx``) bind a namespace via
         ``makeTranslator('ns')`` and look strings up with ``tr('key')``. Those
         map to the ``client.ns.key`` slice of the locale files.

Both surfaces are scanned conservatively: every dotted string literal that
*could* be a key is treated as used. Some keys are referenced only via
runtime-constructed names (``'guide.' ~ risk_word_key``) and can never appear
as a literal — those live in ``scripts/i18n_allowlist.txt`` and are always
counted as used. When in doubt, add to the allowlist rather than delete.

Exit status is non-zero when dead (non-allowlisted) keys exist, so the script
doubles as a CI/regression guard (see ``backend/tests/test_i18n_client.py``).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES_DIR = ROOT / "backend" / "locales"
TEMPLATES_DIR = ROOT / "backend" / "templates"
BACKEND_DIR = ROOT / "backend"
FRONTEND_SRC = ROOT / "frontend" / "src"
ALLOWLIST_FILE = Path(__file__).resolve().parent / "i18n_allowlist.txt"

# A dotted token that could be a locale key: dotted segments of word chars /
# hyphens, e.g. ``guide_labels.fake-online-stores`` or ``page_titles.home``.
DOTTED_KEY_RE = re.compile(r"[A-Za-z_][\w-]*(?:\.[A-Za-z0-9_-]+)+")

# A single-segment key passed to t(...) / t_list(...) — e.g.
# ``t_list(_lang, 'hero_typewriter_phrases')`` — which has no dot and so is
# invisible to DOTTED_KEY_RE. Only harvested from inside a t()/t_list() call so
# arbitrary string literals aren't mistaken for keys.
T_CALL_KEY_RE = re.compile(
    r"\bt(?:_list)?\(\s*_?lang\s*,\s*['\"]([A-Za-z_][\w-]*)['\"]"
)

# Bind a translator variable to its client namespace and find every call.
MAKE_TR_RE = re.compile(r"(\w+)\s*=\s*makeTranslator\(\s*['\"]([^'\"]+)['\"]\s*\)")
TR_CALL_RE = re.compile(r"(\w+)\(\s*['\"]([^'\"]+)['\"]")


def load_allowlist() -> set[str]:
    if not ALLOWLIST_FILE.exists():
        return set()
    out: set[str] = set()
    for raw in ALLOWLIST_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line)
    return out


def _leaf_keys(node: object, prefix: str) -> set[str]:
    """Flatten a locale dict into dotted leaf keys.

    Lists (e.g. ``hero_typewriter_phrases``) and scalars are leaves; only dicts
    recurse. ``client`` is flattened as ``client.<ns>.<key>`` to match usage.
    """
    out: set[str] = set()
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                out |= _leaf_keys(value, child)
            else:
                out.add(child)
    return out


def present_keys() -> set[str]:
    """Leaf keys present in en.json (the authoritative key set)."""
    data = json.loads((LOCALES_DIR / "en.json").read_text(encoding="utf-8"))
    return _leaf_keys(data, "")


def backend_used_keys() -> set[str]:
    """Dotted keys referenced from templates + backend Python.

    Harvests every dotted string literal; the intersection with the real key
    set in :func:`report` filters out non-key dotted strings (domains, paths).
    """
    used: set[str] = set()
    sources: list[Path] = []
    if TEMPLATES_DIR.exists():
        sources += sorted(TEMPLATES_DIR.rglob("*.html"))
    if BACKEND_DIR.exists():
        sources += [
            p
            for p in sorted(BACKEND_DIR.rglob("*.py"))
            if ".venv" not in p.parts and "tests" not in p.parts
        ]
    for path in sources:
        text = path.read_text(encoding="utf-8")
        for match in DOTTED_KEY_RE.finditer(text):
            token = match.group(0)
            if not token.startswith("client."):
                used.add(token)
        # Single-segment keys (top-level lists/scalars) used via t()/t_list().
        for key in T_CALL_KEY_RE.findall(text):
            used.add(key)
    return used


def client_used_keys() -> set[str]:
    """``client.<ns>.<key>`` keys referenced from the React islands."""
    used: set[str] = set()
    if not FRONTEND_SRC.exists():
        return used
    for path in sorted(FRONTEND_SRC.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8")
        # var -> namespace bindings in this file
        ns_by_var: dict[str, str] = {
            var: ns for var, ns in MAKE_TR_RE.findall(text)
        }
        if not ns_by_var:
            continue
        for var, key in TR_CALL_RE.findall(text):
            ns = ns_by_var.get(var)
            if ns is not None:
                used.add(f"client.{ns}.{key}")
    return used


def report() -> int:
    allow = load_allowlist()
    present = present_keys()
    present_client = {k for k in present if k.startswith("client.")}
    present_backend = present - present_client

    backend_used = backend_used_keys()
    client_used = client_used_keys()

    # Used keys that actually exist in the locale files.
    backend_hits = backend_used & present_backend
    client_hits = client_used & present_client

    # Allowlisted keys are always considered used.
    used_all = backend_hits | client_hits | (allow & present)

    dead = present - used_all
    dead_backend = sorted(k for k in dead if not k.startswith("client."))
    dead_client = sorted(k for k in dead if k.startswith("client."))

    missing_client = sorted(client_used - present_client)
    allow_unused = sorted(k for k in allow if k in used_all and k not in (backend_hits | client_hits))

    print("== i18n audit ==")
    print(f"locale keys present (en.json leaves) : {len(present)}")
    print(f"  backend top-level keys             : {len(present_backend)}")
    print(f"  client.* keys                      : {len(present_client)}")
    print()
    print("-- backend surface --")
    print(f"  used keys (exist in locale)        : {len(backend_hits)}")
    print(f"  dead keys                          : {len(dead_backend)}")
    print()
    print("-- client surface --")
    print(f"  used keys (exist in locale)        : {len(client_hits)}")
    print(f"  dead keys                          : {len(dead_client)}")
    print(f"  referenced but MISSING from locale : {len(missing_client)}")
    print()
    print(f"allowlist entries                    : {len(allow)}")
    print(f"  of which keep a key alive           : {len(allow_unused)}")
    print()

    if dead_backend:
        print("DEAD backend keys (delete or allowlist):")
        for k in dead_backend:
            print(f"  - {k}")
        print()
    if dead_client:
        print("DEAD client keys (delete or allowlist):")
        for k in dead_client:
            print(f"  - {k}")
        print()
    if missing_client:
        print("MISSING client keys (referenced in TSX but not in locale):")
        for k in missing_client:
            print(f"  ! {k}")
        print()

    total_dead = len(dead_backend) + len(dead_client)
    if total_dead == 0 and not missing_client:
        print("OK: no dead keys, no missing references.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(report())
