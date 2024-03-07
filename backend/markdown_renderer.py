import re
from urllib.parse import urlparse

import bleach
import markdown


# Cyrillic → Latin transliteration table. Keeps heading anchor IDs ASCII so
# URL fragments and JavaScript selectors work cleanly across browsers and SEO
# tools — Cyrillic-in-id roundtrips poorly through encoding layers.
_RU_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _transliterate_ru(text: str) -> str:
    """Map every Cyrillic letter to its ASCII counterpart, leaving other chars."""
    return "".join(_RU_TO_LATIN.get(c.lower(), c) for c in text)


def _slugify_translit(value: str, separator: str) -> str:
    """Slugify a heading by transliterating Cyrillic first.

    Falls back to python-markdown's default ASCII slugify behaviour after the
    transliteration step, so Latin headings produce the same IDs as before
    while ``## Как работает фишинг?`` becomes ``kak-rabotaet-fishing``.
    """
    translit = _transliterate_ru(value).lower()
    # Strip everything that isn't alphanumeric, whitespace, or the separator.
    translit = re.sub(r"[^\w\s-]", "", translit, flags=re.UNICODE)
    # Collapse whitespace runs into the separator.
    translit = re.sub(r"[\s_]+", separator, translit).strip(separator)
    return translit


_MD = markdown.Markdown(
    extensions=["extra", "codehilite", "toc"],
    extension_configs={
        "codehilite": {
            "css_class": "cyber-code",
            "linenums": False,
        },
        "toc": {
            "permalink": "#",
            "permalink_class": "toc-anchor",
            "slugify": _slugify_translit,
        },
    },
)


# Tags safe to render in user-visible markdown. Excludes <script>, <object>,
# <style>, <form>, etc. <iframe> is allowed but src is filtered against an
# allowlist of trusted media hosts (see _iframe_host_allowed).
_ALLOWED_TAGS = {
    "a", "abbr", "acronym", "b", "blockquote", "br", "code", "del", "div",
    "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
    "i", "iframe", "img", "ins", "kbd", "li", "ol", "p", "pre", "s", "small",
    "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead",
    "tr", "ul",
}

# Hosts whose iframes we trust. Migrated newsletters/interviews embed videos
# from these; anything else is stripped.
_ALLOWED_IFRAME_HOSTS = {
    "kinescope.io",
    "fast.wistia.net",
    "fast.wistia.com",
    "drive.google.com",
    "docs.google.com",
    "youtube.com",
    "youtube-nocookie.com",
    "player.vimeo.com",
}

_STYLEABLE_TAGS = {"div", "span", "iframe", "figure"}
_ALLOWED_PROTOCOLS = {"http", "https", "mailto"}


def _iframe_host_allowed(value: str) -> bool:
    try:
        host = (urlparse(value).hostname or "").lower()
    except ValueError:
        return False
    return any(host == h or host.endswith("." + h) for h in _ALLOWED_IFRAME_HOSTS)


def _safe_style(value: str) -> bool:
    """Block inline styles that could exfiltrate or execute (url(), expression(), JS schemes)."""
    low = value.lower()
    return not any(bad in low for bad in ("javascript:", "expression(", "url(", "</"))


def _attribute_filter(tag: str, name: str, value: str) -> bool:
    if name.startswith("on"):
        return False
    if name in {"class", "id", "title"}:
        return True
    if name == "style":
        return tag in _STYLEABLE_TAGS and _safe_style(value)
    if tag == "a":
        if name in {"rel", "target"}:
            return True
        if name == "href":
            return value.startswith(("http://", "https://", "mailto:", "/", "#"))
    if tag == "img":
        if name in {"alt", "width", "height", "loading"}:
            return True
        if name == "src":
            return value.startswith(("http://", "https://", "/"))
    if tag == "iframe":
        if name in {"width", "height", "allow", "allowfullscreen", "frameborder", "scrolling"}:
            return True
        if name == "src":
            return _iframe_host_allowed(value)
    if tag in {"th", "td"} and name in {"scope", "colspan", "rowspan"}:
        return True
    if tag == "ol" and name in {"start", "type"}:
        return True
    if tag == "li" and name == "value":
        return True
    return False


def _strip_duplicate_h1(text: str, post_title: str) -> str:
    """Remove a leading ``# Title`` line that just repeats ``post_title``.

    Migrated content often starts the markdown body with the same headline that
    already lives in the post's frontmatter (and therefore renders as the page
    h1 in the template). Drop that first h1 so the article body doesn't carry a
    second, duplicate page heading. Match is case-insensitive and tolerant of
    surrounding whitespace; non-matching first lines are left alone.
    """
    if not post_title:
        return text
    normalized_title = post_title.strip().lower()
    if not normalized_title:
        return text
    lines = text.split("\n", 1)
    if not lines:
        return text
    first = lines[0]
    # Only consider a real h1 (single leading "#"), not "##" / "###" / etc.
    stripped = first.lstrip()
    if not stripped.startswith("# "):
        return text
    heading_text = stripped[2:].strip().lower()
    if heading_text != normalized_title:
        return text
    # Drop the first line and any single blank separator that follows it.
    remainder = lines[1] if len(lines) > 1 else ""
    return remainder.lstrip("\n")


def render_markdown(text: str, post_title: str | None = None) -> str:
    """Convert a Markdown string to sanitized HTML for the cyberpunk terminal UI.

    Sanitization strips scripts, event handlers, and dangerous URL schemes, but
    preserves iframe embeds from a small allowlist of video/document hosts so
    migrated video newsletters and interviews continue to render.

    When ``post_title`` is supplied, a leading ``# Title`` line that duplicates
    the post's frontmatter title is removed so the rendered body does not carry
    a second h1 alongside the template's page heading.
    """
    if not text:
        return ""

    if post_title:
        text = _strip_duplicate_h1(text, post_title)

    _MD.reset()
    html = _MD.convert(text)

    safe = bleach.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_attribute_filter,
        protocols=_ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )

    return f'<div class="md-content cyber-terminal">{safe}</div>'
