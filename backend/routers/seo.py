"""SEO and web standards routes — sitemap, RSS, robots, PWA manifest.

These endpoints sit outside the localized /{lang}/ prefix because crawlers and
PWA installers expect them at well-known absolute paths.

All routes are excluded from the OpenAPI schema (they aren't user-facing API).
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, Response

from config import SITE_ORIGIN, STATIC_DIR
from database import get_course_modules, get_guides, get_posts
from i18n import SUPPORTED_LANGS

router = APIRouter()


def _base_url(request: Request) -> str:
    """Return the canonical public origin for absolute sitemap/feed URLs.

    NOT request.base_url: behind the prod nginx proxy uvicorn only trusts
    X-Forwarded-* from loopback while the proxy connects from the Docker
    bridge, so base_url reports the http:// scheme. config.SITE_ORIGIN
    (env-overridable) is the single source of truth, shared with base.html.
    """
    del request  # kept in the signature so call sites stay uniform
    return SITE_ORIGIN


# ---------------------------------------------------------------------------
# robots.txt — dynamic so the Sitemap line carries the live host.
# ---------------------------------------------------------------------------

@router.get("/robots.txt", include_in_schema=False)
async def robots_txt(request: Request) -> PlainTextResponse:
    base = _base_url(request)
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /play/\n"
        "Disallow: /lang/\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )
    return PlainTextResponse(body, media_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------------------
# sitemap.xml — every localized canonical URL.
# ---------------------------------------------------------------------------

def _xml_escape(value: str) -> str:
    """Minimal XML entity escaping for URLs / titles that may contain & or <."""
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _cdata(value: str) -> str:
    """Wrap ``value`` in a CDATA section, neutralising any literal ``]]>``.

    A title/subtitle containing ``]]>`` would otherwise close the CDATA early
    and let raw markup leak into the feed. The standard split keeps the content
    verbatim while breaking the terminator across two CDATA sections.
    """
    return f"<![CDATA[{value.replace(']]>', ']]]]><![CDATA[>')}]]>"


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml(request: Request) -> Response:
    base = _base_url(request)

    # Pull content once in the default locale (slugs are shared across locales).
    posts = await get_posts(locale="en")
    guides = await get_guides(locale="en")
    modules = await get_course_modules(locale="en")

    # Language-agnostic path suffixes (slugs are shared across locales). "" is
    # the localized home (/{lang}/); the rest map to /{lang}/{suffix}.
    # "check"/"inspect" are the two flagship tool pages: crawlable (robots.txt
    # only disallows /api/, /play/, /lang/), canonicalized, hreflang-paired and
    # linked from the nav — so this list, whose contract is every localized
    # canonical URL, has to carry them like any other indexable page.
    # "search" is deliberately NOT here: it is an internal search-results
    # surface, which Google asks you to keep out of the index. It still gets a
    # BreadcrumbList (that markup describes the page, it does not solicit
    # crawling).
    suffixes: list[str] = [
        "",
        "journal",
        "course",
        "check",
        "inspect",
        "game",
        "about",
        "portfolio",
    ]
    for post in posts:
        if post.get("slug"):
            suffixes.append(f"journal/{post['slug']}")
    for guide in guides:
        if guide.get("slug"):
            suffixes.append(f"guide/{guide['slug']}")
    for module in modules:
        if module.get("slug"):
            suffixes.append(f"course/{module['slug']}")

    def _loc(lang: str, suffix: str) -> str:
        return f"{base}/{lang}/" if not suffix else f"{base}/{lang}/{suffix}"

    # SEO-1: emit one <url> per (locale, page) carrying xhtml:link hreflang
    # alternates to every locale + x-default (→ en), so Google links the locales
    # instead of treating /en and /ru as duplicates.
    body_parts = ['<?xml version="1.0" encoding="UTF-8"?>\n']
    body_parts.append(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    )
    for suffix in suffixes:
        alternates = "".join(
            f'    <xhtml:link rel="alternate" hreflang="{lang}" '
            f'href="{_xml_escape(_loc(lang, suffix))}"/>\n'
            for lang in SUPPORTED_LANGS
        )
        alternates += (
            f'    <xhtml:link rel="alternate" hreflang="x-default" '
            f'href="{_xml_escape(_loc("en", suffix))}"/>\n'
        )
        for lang in SUPPORTED_LANGS:
            body_parts.append(
                f"  <url><loc>{_xml_escape(_loc(lang, suffix))}</loc>\n"
                f"{alternates}  </url>\n"
            )
    body_parts.append("</urlset>\n")

    return Response("".join(body_parts), media_type="application/xml; charset=utf-8")


# ---------------------------------------------------------------------------
# RSS feed — recent posts (English by default; lang param picks a locale).
# ---------------------------------------------------------------------------

def _to_rfc822(value: Optional[str]) -> str:
    """Turn an ISO-ish published_at string into RFC-822 (RSS pubDate).

    Accepts YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS. Falls back to "now" if the
    value is missing or unparseable rather than failing the whole feed.
    """
    if not value:
        return format_datetime(datetime.now(timezone.utc), usegmt=True)
    cleaned = value.strip().replace("Z", "")
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError:
        try:
            dt = datetime.strptime(cleaned[:10], "%Y-%m-%d")
        except ValueError:
            return format_datetime(datetime.now(timezone.utc), usegmt=True)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt, usegmt=True)


@router.get("/feed.xml", include_in_schema=False)
async def rss_feed(request: Request) -> Response:
    base = _base_url(request)
    # All post types (interview/newsletter/article) in published_at order; no
    # type_filter ⇒ get_posts returns every type. 30 most-recent items (F3).
    posts = await get_posts(limit=30, locale="en")

    items: list[str] = []
    for post in posts:
        slug = post.get("slug")
        if not slug:
            continue
        url = f"{base}/en/journal/{slug}"
        title = post.get("title") or slug
        subtitle = post.get("subtitle") or ""
        pub_date = _to_rfc822(post.get("published_at"))
        items.append(
            "  <item>\n"
            f"    <title>{_cdata(title)}</title>\n"
            f"    <link>{_xml_escape(url)}</link>\n"
            f"    <guid isPermaLink=\"true\">{_xml_escape(url)}</guid>\n"
            f"    <pubDate>{pub_date}</pubDate>\n"
            f"    <description>{_cdata(subtitle)}</description>\n"
            "  </item>\n"
        )

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "  <channel>\n"
        "    <title>DiScammer</title>\n"
        f"    <link>{_xml_escape(base)}/</link>\n"
        f"    <atom:link href=\"{_xml_escape(base)}/feed.xml\" rel=\"self\" type=\"application/rss+xml\" />\n"
        "    <description>Anti-fraud field briefings — interviews, newsletters, articles.</description>\n"
        "    <language>en</language>\n"
        f"    <lastBuildDate>{format_datetime(datetime.now(timezone.utc), usegmt=True)}</lastBuildDate>\n"
        + "".join(items)
        + "  </channel>\n"
        "</rss>\n"
    )
    return Response(body, media_type="application/rss+xml; charset=utf-8")


# ---------------------------------------------------------------------------
# PWA Web App Manifest — served at root for install affordance.
# ---------------------------------------------------------------------------

@router.get("/manifest.webmanifest", include_in_schema=False)
async def webmanifest() -> Response:
    manifest = {
        "name": "DiScammer",
        "short_name": "DiScammer",
        "description": "Anti-fraud field briefings, threat database, and analyst training.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#0b0f1a",
        "theme_color": "#0b0f1a",
        "orientation": "portrait-primary",
        "lang": "en",
        "categories": ["education", "security", "news"],
        "icons": [
            {
                "src": "/static/logomark.svg",
                "type": "image/svg+xml",
                "sizes": "any",
                "purpose": "any",
            },
            {
                "src": "/static/favicon.svg",
                "type": "image/svg+xml",
                "sizes": "any",
                "purpose": "maskable",
            },
        ],
    }
    return Response(
        content=json.dumps(manifest, ensure_ascii=False, indent=2),
        media_type="application/manifest+json",
    )


# ---------------------------------------------------------------------------
# PERF-3 — service worker, served from ROOT scope.
#
# The SW must be served from the origin root (not under /static/) so it can
# control navigations site-wide, and with `Cache-Control: no-cache` so browsers
# always re-fetch it and pick up a new deploy's worker (never pin a stale one —
# the same anti-stale reasoning as the HTML `no-cache` in main.py). The file
# itself is emitted into backend/static/sw.js by `npm run build`
# (frontend/vite-plugin-sw.ts); this route just serves it from `/sw.js`.
# ---------------------------------------------------------------------------

_SERVICE_WORKER_PATH = STATIC_DIR / "sw.js"


@router.get("/sw.js", include_in_schema=False)
async def service_worker() -> Response:
    try:
        body = _SERVICE_WORKER_PATH.read_bytes()
    except OSError:
        # Frontend not built yet — no worker to serve. 404 so the client-side
        # registration fails gracefully (it is guarded and swallows failures);
        # a previously installed worker keeps running on its own update cycle.
        return Response(status_code=404)
    return Response(
        content=body,
        media_type="text/javascript",
        headers={
            # Always revalidate the worker so a new deploy is picked up promptly.
            "Cache-Control": "no-cache",
            # …and say the same thing to the CDN, which does not read the line
            # above. Production serves this file as `max-age=14400` (observed
            # 2026-08-01); a cache-busted request still returns `max-age=14400`
            # on a `cf-cache-status: MISS`, so the Cloudflare zone is applying
            # its default Browser Cache TTL rather than the "Respect Existing
            # Headers" setting docs/cloudflare/SETUP.md mandates. That zone
            # setting is the actual remedy — it covers the whole non-hashed
            # bucket (fonts, favicon, logomark, OG image), not just this route.
            #
            # No stale-worker exposure is known: the Service Worker spec forces
            # `cache: no-cache` on the script request for registration AND every
            # update check, sw-register.ts leaves `updateViaCache` at default,
            # and the worker uses no importScripts(). This is defence in depth,
            # not an incident fix. Both headers are consumed and stripped by the
            # edge, so the browser still sees the plain `no-cache` above.
            "Cloudflare-CDN-Cache-Control": "no-store",  # CF-specific, wins over the below
            "CDN-Cache-Control": "no-store",  # RFC 9213 — any other CDN in front
            # Permit root scope explicitly (belt-and-braces; the file is already
            # served from the root path, which grants `/` by default).
            "Service-Worker-Allowed": "/",
        },
    )


# ---------------------------------------------------------------------------
# SEO-3 — IndexNow key-ownership file, served from ROOT scope.
#
# IndexNow lets us notify Bing/Yandex the moment content changes
# (scripts/indexnow-ping.sh, called from deploy.sh). Those engines only accept a
# submission if the submitting host proves control of the key by hosting a file
# named `<key>.txt` at the site root whose body is the key itself.
#
# This route is OPT-IN and adds no public surface until the owner sets
# INDEXNOW_KEY: with it unset the route 404s. The path pattern is a single
# segment ending in `.txt`, so it can only ever match a root-level `*.txt`
# request — and `/robots.txt` is registered ABOVE it, so that explicit route
# still wins. A request for any `.txt` that is not the configured key returns a
# plain 404 (never the branded HTML 404), so the key is not guessable by probing
# and no other `.txt` name is shadowed.
# ---------------------------------------------------------------------------

# IndexNow spec: key is 8–128 chars from [a-zA-Z0-9-]. Validating the CONFIGURED
# key (not the request) means a typo'd env value is treated as "unset" rather
# than publishing a bogus ownership file.
_INDEXNOW_KEY_RE = re.compile(r"^[a-zA-Z0-9-]{8,128}$")


def _valid_indexnow_key(key: str) -> bool:
    return bool(key) and bool(_INDEXNOW_KEY_RE.match(key))


@router.get("/{indexnow_key}.txt", include_in_schema=False)
async def indexnow_key_file(indexnow_key: str) -> Response:
    # Read the key at request time (not an import-time constant) so it can be
    # provisioned via env without a code change — and so tests can set it.
    import config

    configured = config.INDEXNOW_KEY
    if not _valid_indexnow_key(configured) or indexnow_key != configured:
        # Unset/malformed key, or a probe for a different `.txt` name → plain
        # 404. Not the HTML template: this is a machine-facing well-known file.
        return Response(status_code=404)
    return Response(
        content=configured,
        media_type="text/plain; charset=utf-8",
        headers={
            # The ownership token is stable per key; let the edge cache it. It is
            # not secret (it is published on purpose) so a long TTL is safe.
            "Cache-Control": "public, max-age=86400",
        },
    )


__all__ = ["router"]
