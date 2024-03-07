import re

from fastapi import APIRouter, Path, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from database import (
    get_course_modules,
    get_guides,
    get_guide_by_slug,
    get_lesson,
    get_lessons_for_module,
    get_module_by_slug,
    get_post_by_slug,
    get_posts,
    get_related_guides,
    get_related_posts,
)
from i18n import SUPPORTED_LANGS, detect_lang, normalize_lang, t
from markdown_renderer import render_markdown

router = APIRouter()

# Path constraint that forces ``lang`` to a supported code.
LANG_REGEX = "|".join(SUPPORTED_LANGS)
LangPath = Path(..., pattern=f"^({LANG_REGEX})$", description="Language code")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _course_totals(modules: list[dict], lang: str = "en") -> dict:
    """Sum module counts / lessons / runtime for the course hero header.

    ``runtime`` is localized — RU shows "8ч 50м", EN shows "8h 50m" — so the
    course briefing terminal does not leak EN time units onto the Russian page.
    ``iso_duration`` stays ASCII (``PT8H50M``) so JSON-LD schema.org metadata
    remains valid no matter which UI language the page is rendered in.
    """
    total_minutes = 0
    for m in modules:
        match = re.search(r"\d+", m.get("duration") or "")
        if match:
            total_minutes += int(match.group())
    hours, minutes = divmod(total_minutes, 60)
    h_unit = t(lang, "course.hours_short")
    m_unit = t(lang, "course.minutes_short_compact")
    if hours and minutes:
        runtime = f"{hours}{h_unit} {minutes:02d}{m_unit}"
    elif hours:
        runtime = f"{hours}{h_unit}"
    else:
        runtime = f"{minutes}{m_unit}"
    if hours and minutes:
        iso_duration = f"PT{hours}H{minutes}M"
    elif hours:
        iso_duration = f"PT{hours}H"
    else:
        iso_duration = f"PT{minutes}M"
    return {
        "modules": len(modules),
        "lessons": sum(m.get("lessons") or 0 for m in modules),
        "runtime": runtime,
        "iso_duration": iso_duration,
    }


def _templates(request: Request):
    return request.app.state.templates


def _switch_url(request: Request, current_lang: str, target_lang: str) -> str:
    """Return the same path with the lang prefix swapped to ``target_lang``."""
    path = request.url.path
    prefix = f"/{current_lang}"
    if path in (prefix, f"{prefix}/"):
        return f"/{target_lang}/"
    if path.startswith(prefix + "/"):
        return f"/{target_lang}" + path[len(prefix):]
    return f"/{target_lang}/"


def _base_context(request: Request, lang: str) -> dict:
    """Common template context shared by every page render."""
    other = "ru" if lang == "en" else "en"
    return {
        "lang": lang,
        "locale": lang,  # legacy alias used by module.html / lesson.html
        "other_lang_code": other,
        "switch_url": _switch_url(request, lang, other),
    }


# ---------------------------------------------------------------------------
# Root + legacy redirects
# ---------------------------------------------------------------------------

@router.get("/", include_in_schema=False)
async def root(request: Request):
    cookie_lang = request.cookies.get("lang")
    accept = request.headers.get("accept-language")
    lang = detect_lang(accept, cookie_lang)
    return RedirectResponse(url=f"/{lang}/", status_code=302)


def _legacy_redirect(request: Request, path: str) -> RedirectResponse:
    cookie_lang = normalize_lang(request.cookies.get("lang"))
    return RedirectResponse(url=f"/{cookie_lang}{path}", status_code=302)


@router.get("/journal", include_in_schema=False)
async def journal_compat(request: Request):
    return _legacy_redirect(request, "/journal")


@router.get("/journal/{slug}", include_in_schema=False)
async def journal_slug_compat(slug: str, request: Request):
    return _legacy_redirect(request, f"/journal/{slug}")


@router.get("/guide/{slug}", include_in_schema=False)
async def guide_compat(slug: str, request: Request):
    return _legacy_redirect(request, f"/guide/{slug}")


@router.get("/course", include_in_schema=False)
async def course_compat(request: Request):
    return _legacy_redirect(request, "/course")


@router.get("/course/{module_slug}", include_in_schema=False)
async def module_compat(module_slug: str, request: Request):
    return _legacy_redirect(request, f"/course/{module_slug}")


@router.get("/course/{module_slug}/{lesson_slug}", include_in_schema=False)
async def lesson_compat(module_slug: str, lesson_slug: str, request: Request):
    return _legacy_redirect(request, f"/course/{module_slug}/{lesson_slug}")


@router.get("/game", include_in_schema=False)
async def game_compat(request: Request):
    return _legacy_redirect(request, "/game")


@router.get("/about", include_in_schema=False)
async def about_compat(request: Request):
    return _legacy_redirect(request, "/about")


def _safe_next(next_param: str | None, target: str) -> str:
    """Validate the ``next`` redirect target so the lang switch can't be turned
    into an open redirect. Accept only same-origin paths: a single leading "/",
    no protocol-relative "//", no backslash trick "/\\", no embedded scheme
    such as ``javascript:`` or a control char. Anything else falls back to the
    localized home for ``target``.
    """
    fallback = f"/{target}/"
    if not next_param:
        return fallback
    # Must start with exactly one forward slash.
    if not next_param.startswith("/"):
        return fallback
    # Reject protocol-relative ("//evil.example") and the backslash variant
    # ("/\\evil.example") that some browsers normalize to "//".
    if next_param.startswith(("//", "/\\")):
        return fallback
    # Strip any chars that could trick a downstream URL parser. Also bail on
    # whitespace / control bytes which can be smuggled past a naive prefix
    # check.
    if any(ch in next_param for ch in ("\r", "\n", "\t", " ")):
        return fallback
    return next_param


@router.get("/lang/{target}", include_in_schema=False)
async def switch_lang(target: str, request: Request):
    """Set the lang cookie and redirect to ``?next=...`` (defaults to /<lang>/)."""
    target = normalize_lang(target)
    next_url = _safe_next(request.query_params.get("next"), target)
    response = RedirectResponse(url=next_url, status_code=302)
    response.set_cookie(
        key="lang",
        value=target,
        max_age=60 * 60 * 24 * 365,
        path="/",
        samesite="lax",
    )
    return response


# ---------------------------------------------------------------------------
# Localised pages
# ---------------------------------------------------------------------------

@router.get("/{lang}/", response_class=HTMLResponse)
@router.get("/{lang}", response_class=HTMLResponse)
async def home(request: Request, lang: str = LangPath):
    interviews = await get_posts(type_filter="interview", locale=lang)
    newsletters = await get_posts(type_filter="newsletter", locale=lang)
    articles = await get_posts(type_filter="article", locale=lang)
    guides = await get_guides(locale=lang)

    stats = {
        "threats": len(guides),
        "interviews": len(interviews),
        "articles": len(articles),
        "newsletters": len(newsletters),
    }

    # Most recent published_at across all post types — drives the hero HUD's
    # "LAST FILED" timestamp. Posts are returned ordered by published_at DESC,
    # so the head of each list is its own latest. Compare across lists.
    _candidates = [
        lst[0].get("published_at")
        for lst in (newsletters, articles, interviews)
        if lst and lst[0].get("published_at")
    ]
    latest_published_at = max(_candidates) if _candidates else ""

    return _templates(request).TemplateResponse(
        request,
        "home.html",
        {
            **_base_context(request, lang),
            "interviews": interviews[:4],
            "newsletters": newsletters[:4],
            "articles": articles[:4],
            "guides": guides,
            "stats": stats,
            "latest_published_at": latest_published_at,
            "page_title": t(lang, "page_titles.home"),
        },
    )


@router.get("/{lang}/journal", response_class=HTMLResponse)
async def journal(request: Request, lang: str = LangPath):
    posts = await get_posts(locale=lang)
    guides = await get_guides(locale=lang)

    return _templates(request).TemplateResponse(
        request,
        "journal.html",
        {
            **_base_context(request, lang),
            "posts": posts,
            "guides": guides,
            "page_title": t(lang, "page_titles.journal"),
        },
    )


@router.get("/{lang}/journal/{slug}", response_class=HTMLResponse)
async def post_detail(slug: str, request: Request, lang: str = LangPath):
    post = await get_post_by_slug(slug, locale=lang)
    if not post:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {
                **_base_context(request, lang),
                "page_title": t(lang, "page_titles.not_found"),
            },
            status_code=404,
        )

    related = await get_related_posts(post["type"], slug, locale=lang)
    post["content_html"] = render_markdown(
        post.get("content") or "",
        post_title=post.get("title"),
    )

    return _templates(request).TemplateResponse(
        request,
        "post.html",
        {
            **_base_context(request, lang),
            "post": post,
            "related_posts": related,
            "page_title": f"{post['title']} · DiScammer",
        },
    )


@router.get("/{lang}/guide/{slug}", response_class=HTMLResponse)
async def guide_detail(slug: str, request: Request, lang: str = LangPath):
    guide = await get_guide_by_slug(slug, locale=lang)
    if not guide:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {
                **_base_context(request, lang),
                "page_title": t(lang, "page_titles.not_found"),
            },
            status_code=404,
        )

    related = await get_related_guides(slug, locale=lang)
    guide["content_html"] = render_markdown(
        guide.get("content") or "",
        post_title=guide.get("title"),
    )

    return _templates(request).TemplateResponse(
        request,
        "guide.html",
        {
            **_base_context(request, lang),
            "guide": guide,
            "related_guides": related,
            "page_title": f"{guide['title']} · DiScammer",
        },
    )


@router.get("/{lang}/course", response_class=HTMLResponse)
async def course(request: Request, lang: str = LangPath):
    modules = await get_course_modules(locale=lang)

    return _templates(request).TemplateResponse(
        request,
        "course.html",
        {
            **_base_context(request, lang),
            "modules": modules,
            "course_totals": _course_totals(modules, lang),
            "page_title": t(lang, "page_titles.course"),
        },
    )


@router.get("/{lang}/course/{module_slug}", response_class=HTMLResponse)
async def course_module(
    request: Request, module_slug: str, lang: str = LangPath
):
    module = await get_module_by_slug(module_slug, locale=lang)
    if not module:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {
                **_base_context(request, lang),
                "page_title": t(lang, "page_titles.not_found"),
            },
            status_code=404,
        )

    lessons = await get_lessons_for_module(module_slug, locale=lang)
    module["content_html"] = render_markdown(module.get("content") or "")

    return _templates(request).TemplateResponse(
        request,
        "module.html",
        {
            **_base_context(request, lang),
            "module": module,
            "lessons": lessons,
            "page_title": f"{module['title']} — DiScammer",
        },
    )


@router.get("/{lang}/course/{module_slug}/{lesson_slug}", response_class=HTMLResponse)
async def course_lesson(
    request: Request,
    module_slug: str,
    lesson_slug: str,
    lang: str = LangPath,
):
    module = await get_module_by_slug(module_slug, locale=lang)
    lesson = await get_lesson(module_slug, lesson_slug, locale=lang)
    if not module or not lesson:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {
                **_base_context(request, lang),
                "page_title": t(lang, "page_titles.not_found"),
            },
            status_code=404,
        )

    lessons = await get_lessons_for_module(module_slug, locale=lang)
    idx = next((i for i, ls in enumerate(lessons) if ls["slug"] == lesson_slug), None)
    prev_lesson = lessons[idx - 1] if idx and idx > 0 else None
    next_lesson = (
        lessons[idx + 1] if idx is not None and idx + 1 < len(lessons) else None
    )

    lesson["body_html"] = render_markdown(lesson.get("body_md") or "")

    return _templates(request).TemplateResponse(
        request,
        "lesson.html",
        {
            **_base_context(request, lang),
            "module": module,
            "lesson": lesson,
            "lessons": lessons,
            "prev_lesson": prev_lesson,
            "next_lesson": next_lesson,
            "page_title": f"{lesson['title']} — {module['title']}",
        },
    )


@router.get("/{lang}/game", response_class=HTMLResponse)
async def game(request: Request, lang: str = LangPath):
    return _templates(request).TemplateResponse(
        request,
        "game.html",
        {
            **_base_context(request, lang),
            "page_title": t(lang, "page_titles.game"),
        },
    )


@router.get("/{lang}/about", response_class=HTMLResponse)
async def about(request: Request, lang: str = LangPath):
    return _templates(request).TemplateResponse(
        request,
        "about.html",
        {
            **_base_context(request, lang),
            "page_title": t(lang, "about.page_title"),
        },
    )


__all__ = ["router"]
