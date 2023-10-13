from urllib.parse import urlparse

import bleach
import markdown


_MD = markdown.Markdown(
    extensions=["extra", "codehilite", "toc"],
    extension_configs={
        "codehilite": {
            "css_class": "cyber-code",
            "linenums": False,
        },
        "toc": {
            "permalink": True,
            "permalink_class": "toc-anchor",
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


def render_markdown(text: str) -> str:
    """Convert a Markdown string to sanitized HTML for the cyberpunk terminal UI.

    Sanitization strips scripts, event handlers, and dangerous URL schemes, but
    preserves iframe embeds from a small allowlist of video/document hosts so
    migrated video newsletters and interviews continue to render.
    """
    if not text:
        return ""

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
