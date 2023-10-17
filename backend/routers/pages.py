from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from database import (
    get_course_modules,
    get_guides,
    get_guide_by_slug,
    get_post_by_slug,
    get_posts,
    get_related_guides,
    get_related_posts,
)
from markdown_renderer import render_markdown

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _templates(request: Request):
    """Shortcut to access the Jinja2Templates instance stored on the app."""
    return request.app.state.templates


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    interviews = await get_posts(type_filter="interview", limit=4)
    newsletters = await get_posts(type_filter="newsletter", limit=4)
    articles = await get_posts(type_filter="article", limit=4)
    guides = await get_guides()

    return _templates(request).TemplateResponse(
        request,
        "home.html",
        {
            "interviews": interviews,
            "newsletters": newsletters,
            "articles": articles,
            "guides": guides,
            "page_title": "DiScammer — Cyber Security Education",
        },
    )


@router.get("/journal", response_class=HTMLResponse)
async def journal(request: Request):
    posts = await get_posts()
    guides = await get_guides()

    return _templates(request).TemplateResponse(
        request,
        "journal.html",
        {
            "posts": posts,
            "guides": guides,
            "page_title": "Journal — DiScammer",
        },
    )


@router.get("/journal/{slug}", response_class=HTMLResponse)
async def post_detail(request: Request, slug: str):
    post = await get_post_by_slug(slug)
    if not post:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {"page_title": "Not Found — DiScammer"},
            status_code=404,
        )

    related = await get_related_posts(post["type"], slug)
    post["content_html"] = render_markdown(post.get("content") or "")

    return _templates(request).TemplateResponse(
        request,
        "post.html",
        {
            "post": post,
            "related_posts": related,
            "page_title": f"{post['title']} — DiScammer",
        },
    )


@router.get("/guide/{slug}", response_class=HTMLResponse)
async def guide_detail(request: Request, slug: str):
    guide = await get_guide_by_slug(slug)
    if not guide:
        return _templates(request).TemplateResponse(
            request,
            "404.html",
            {"page_title": "Not Found — DiScammer"},
            status_code=404,
        )

    related = await get_related_guides(slug)
    guide["content_html"] = render_markdown(guide.get("content") or "")

    return _templates(request).TemplateResponse(
        request,
        "guide.html",
        {
            "guide": guide,
            "related_guides": related,
            "page_title": f"{guide['title']} — DiScammer",
        },
    )


@router.get("/course", response_class=HTMLResponse)
async def course(request: Request):
    modules = await get_course_modules()

    return _templates(request).TemplateResponse(
        request,
        "course.html",
        {
            "modules": modules,
            "page_title": "Course — DiScammer",
        },
    )


@router.get("/game", response_class=HTMLResponse)
async def game(request: Request):
    return _templates(request).TemplateResponse(
        request,
        "game.html",
        {
            "page_title": "Cyber Watch — DiScammer",
        },
    )
