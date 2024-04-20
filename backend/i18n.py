"""Lightweight i18n for DiScammer.

Loads ``locales/{lang}.json`` once at import time and exposes a ``t(key, ...)``
helper that walks dotted keys (``home.cta_play``) and supports brace
substitution (``t("course.tag", modules=9)``).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

LOCALES_DIR = Path(__file__).resolve().parent / "locales"

DEFAULT_LANG = "en"
SUPPORTED_LANGS = ("en", "ru")

_translations: dict[str, dict[str, Any]] = {}


def _load_lang(lang: str) -> dict[str, Any]:
    path = LOCALES_DIR / f"{lang}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _bootstrap() -> None:
    for lang in SUPPORTED_LANGS:
        _translations[lang] = _load_lang(lang)


_bootstrap()


def _resolve(lang: str, key: str) -> Any:
    """Walk dotted ``key`` against the loaded dict, falling back to EN then ``key``."""
    parts = key.split(".")
    for source_lang in (lang, DEFAULT_LANG):
        node: Any = _translations.get(source_lang, {})
        for part in parts:
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                node = None
                break
        if node is not None:
            return node
    return key


def t(lang: str, key: str, /, **kwargs: Any) -> str:
    """Return the translation for ``key`` in ``lang`` (with EN fallback).

    ``kwargs`` are substituted as ``{name}`` placeholders in the resolved string.
    """
    value = _resolve(lang, key)
    if isinstance(value, str) and kwargs:
        try:
            return value.format(**kwargs)
        except (KeyError, IndexError, ValueError):
            # ValueError covers unbalanced braces in a translation string —
            # a locale-file edit must degrade to the raw string, never 500.
            return value
    return value if isinstance(value, str) else str(value)


def t_list(lang: str, key: str) -> list[str]:
    """Resolve a key that points to a list (e.g. typewriter phrases)."""
    value = _resolve(lang, key)
    if isinstance(value, list):
        return [str(v) for v in value]
    return []


def normalize_lang(value: str | None) -> str:
    """Map any input to a supported language code; fall back to default."""
    if not value:
        return DEFAULT_LANG
    code = value.strip().lower().split("-")[0]
    if code in SUPPORTED_LANGS:
        return code
    return DEFAULT_LANG


def detect_lang(accept_language: str | None, cookie_lang: str | None) -> str:
    """Pick a language from cookie first, then Accept-Language, else default."""
    if cookie_lang:
        normalized = normalize_lang(cookie_lang)
        if normalized in SUPPORTED_LANGS:
            return normalized
    if accept_language:
        for chunk in accept_language.split(","):
            code = normalize_lang(chunk.split(";")[0])
            if code in SUPPORTED_LANGS and (
                chunk.strip().lower().startswith(code) or code != DEFAULT_LANG
            ):
                return code
    return DEFAULT_LANG


def other_lang(lang: str) -> str:
    """Return the opposite supported language for the toggle link."""
    if lang == "en":
        return "ru"
    return "en"


def supported() -> Iterable[str]:
    return SUPPORTED_LANGS
