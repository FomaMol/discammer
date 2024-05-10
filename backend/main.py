import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import SITE_ORIGIN, STATIC_DIR, TEMPLATES_DIR
from database import init_db
from seed_data import seed_database

# Ensure the backend package is on sys.path so sibling imports work when
# running with ``uvicorn main:app`` from the backend directory.
_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from i18n import (  # noqa: E402
    DEFAULT_LANG,
    SUPPORTED_LANGS,
    other_lang,
    t,
    t_list,
)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    await init_db()
    await seed_database()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DiScammer",
    description="Cybersecurity education platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Jinja2 templates — stored on app.state so routers can access them.
# Workaround: when running locally on Python 3.14 the default Jinja2 LRUCache
# blows up; building the Environment manually with caching disabled sidesteps
# it. Harmless under Python 3.12 in the prod container.
from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402

from datetime import datetime, timezone  # noqa: E402

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(),
    auto_reload=True,
    cache_size=0,
)


import time  # noqa: E402

# Short-TTL memo: saves the blocking stat() per asset per request (base.html
# calls asset_url 5x per page) while still picking up `npm run build` in the
# dev loop within a minute (uvicorn --reload only restarts on .py changes, so
# a process-lifetime cache would freeze the ?v= cache-buster). Failures are
# never cached: a missing-then-built asset must regain its version stamp.
_asset_memo: dict[str, tuple[float, str]] = {}
_ASSET_TTL = 60.0


def _asset_url(path: str) -> str:
    """Append ?v=<file mtime> to a /static URL so browsers re-fetch after deploy.

    Vite emits stable filenames (no hash in name) so without a query string
    the browser keeps the old CSS/JS until manually cleared.
    """
    hit = _asset_memo.get(path)
    now = time.monotonic()
    if hit and now - hit[0] < _ASSET_TTL:
        return hit[1]
    clean, _, _ = path.partition("?")
    target = STATIC_DIR / clean.removeprefix("/static/")
    try:
        mtime = int(target.stat().st_mtime)
    except OSError:
        return path
    sep = "&" if "?" in path else "?"
    url = f"{path}{sep}v={mtime}"
    _asset_memo[path] = (now, url)
    return url


# Expose `now()` to templates for things like dynamic copyright years.
from assets import vite_entry  # noqa: E402

_env.globals["now"] = lambda: datetime.now(timezone.utc)
_env.globals["asset_url"] = _asset_url
# Manifest-driven hashed asset URLs for the JS/CSS bundle (no ?v= cache-bust on
# JS chunks — content hashes in filenames are the only cache-buster; see A1).
_env.globals["vite_entry"] = vite_entry
_env.globals["site_origin"] = SITE_ORIGIN
_env.globals["supported_langs"] = list(SUPPORTED_LANGS)
_env.globals["default_lang"] = DEFAULT_LANG
_env.globals["other_lang"] = other_lang


def _t(lang: str, key: str, **kwargs):
    return t(lang, key, **kwargs)


def _t_list(lang: str, key: str):
    return t_list(lang, key)


_env.globals["t"] = _t
_env.globals["t_list"] = _t_list


def _localized_url(lang: str, path: str = "") -> str:
    """Build a `/{lang}/path` URL, normalising leading slashes."""
    clean = path.lstrip("/")
    if not clean:
        return f"/{lang}/"
    return f"/{lang}/{clean}"


_env.globals["localized_url"] = _localized_url
app.state.templates = Jinja2Templates(env=_env)

# Routers
from routers.pages import router as pages_router  # noqa: E402
from routers.api import router as api_router  # noqa: E402
from routers.game import router as game_router  # noqa: E402
from routers.seo import router as seo_router  # noqa: E402

# Include API + game + seo routers FIRST so their /api/..., /play/..., and
# /sitemap.xml-style routes resolve before the catch-all /{lang}/... patterns
# in pages_router. Without this order, FastAPI tries the localised path
# constraint against "api" / "sitemap.xml" / "robots.txt" and returns a 422
# instead of dispatching to the correct router.
app.include_router(api_router)
app.include_router(game_router)
app.include_router(seo_router)
app.include_router(pages_router)


# ---------------------------------------------------------------------------
# Custom 404 handler — render the terminal-style 404 template instead of
# FastAPI's default {"detail": "Not Found"} JSON. Detect lang from the URL
# prefix (/en/... → en, /ru/... → ru) or fall back to the cookie / default.
# ---------------------------------------------------------------------------

from fastapi import Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.responses import JSONResponse, PlainTextResponse  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402

from i18n import normalize_lang, detect_lang  # noqa: E402


# Asset / feed paths that should never get the marketing HTML 404 template.
# A bot asking for /sitemap.xml-typo doesn't want a styled error page; it wants
# a plain 404 it can log. The same applies to /static/* misses.
_PLAINTEXT_404_EXTENSIONS = (
    ".xml", ".txt", ".webmanifest", ".json", ".svg",
    # Root-level asset probes browsers/bots fire automatically — a 19 KB HTML
    # 404 for /favicon.ico or /apple-touch-icon.png is pure waste.
    ".ico", ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".js", ".css", ".map", ".woff", ".woff2",
)


def _is_asset_path(path: str) -> bool:
    """True for paths that look like a file/asset request, not a page route.

    Matches both clean endings ("/foo.xml") and typo variants
    ("/foo.xml-old", "/foo.xml.bak") by checking whether any of the known
    extensions appears anywhere in the path. Also matches anything under
    /static/ regardless of suffix.

    Localized page namespaces are exempt: "/en/journal/foo.json" is a missing
    *page* (a human following a bad link), so it deserves the HTML 404, not
    the plaintext bot response.
    """
    if path.startswith("/static/"):
        return True
    if any(path.startswith(f"/{code}/") for code in SUPPORTED_LANGS):
        return False
    lower = path.lower()
    return any(ext in lower for ext in _PLAINTEXT_404_EXTENSIONS)


def _render_404(request: Request):
    """Render the branded 404 template with lang detected from URL prefix,
    cookie, or Accept-Language."""
    path = request.url.path
    lang = None
    parts = path.lstrip("/").split("/", 1)
    if parts and parts[0] in SUPPORTED_LANGS:
        lang = parts[0]
    if lang is None:
        cookie_lang = request.cookies.get("lang")
        lang = detect_lang(request.headers.get("accept-language"), cookie_lang)
    lang = normalize_lang(lang)
    other = other_lang(lang)

    templates: Jinja2Templates = app.state.templates
    context = {
        "lang": lang,
        "locale": lang,
        "other_lang_code": other,
        "switch_url": f"/{other}/",
        "page_title": t(lang, "not_found.title"),
    }
    return templates.TemplateResponse(
        request=request,
        name="404.html",
        context=context,
        status_code=404,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Render 404.html for HTML 404s; pass non-404s through as JSON."""
    if exc.status_code != 404:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    # API and game routes keep the JSON detail — only HTML clients get the template.
    path = request.url.path
    if path.startswith("/api/") or path.startswith("/play/"):
        return JSONResponse(status_code=404, content={"detail": exc.detail})

    # SEO / asset typos ("/sitemap.xml-x", "/robots.txt-x", "/static/foo.png", …)
    # don't want a full HTML 404 page — bots that asked for a feed or static
    # asset should get a small plain-text body so they don't try to parse our
    # marketing template. Keep the path in the body for log-grep usefulness.
    if _is_asset_path(path):
        return PlainTextResponse(
            f"404 Not Found: {path}\n",
            status_code=404,
        )

    return _render_404(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Paths that fail the ``/{lang}/...`` regex constraint (an unsupported
    language like /de/about, a stale feed typo, a stray top-level URL) must
    not surface as raw 422 JSON: a human gets the branded 404 page, a bot
    asking for an asset-looking path gets plaintext. Real validation errors
    on API routes keep the default 422 JSON behavior.
    """
    path = request.url.path
    if _is_asset_path(path):
        return PlainTextResponse(
            f"404 Not Found: {path}\n",
            status_code=404,
        )
    if not path.startswith("/api/") and not path.startswith("/play/"):
        return _render_404(request)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})
