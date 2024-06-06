"""Tests for the i18n helper — placeholder interpolation and the
malformed-format-string fallback."""
from __future__ import annotations

import sys
from pathlib import Path

# Backend dir is on sys.path via pytest.ini (pythonpath = backend), but tests
# import this module directly so be defensive.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import i18n
from i18n import t


def test_t_interpolates_placeholders():
    out = t("en", "course.terminal_lessons", lessons=5)
    assert "5" in out
    assert "{lessons}" not in out


def test_t_malformed_braces_fall_back_to_raw_string():
    # An unbalanced brace makes str.format raise ValueError — a locale-file
    # edit must degrade to the raw string, never 500.
    broken = "lessons {count"
    monkey_key = "_test_broken_brace"
    i18n._translations["en"][monkey_key] = broken
    try:
        assert t("en", monkey_key, count=5) == broken
    finally:
        del i18n._translations["en"][monkey_key]


def test_t_missing_placeholder_falls_back_to_raw_string():
    # KeyError path: kwargs that don't cover every placeholder must also
    # degrade to the raw string.
    raw = t("en", "course.terminal_lessons")
    assert t("en", "course.terminal_lessons", wrong_name=1) == raw
