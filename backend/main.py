import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import (
    CLIENT_ERROR_RATE_LIMIT,
    CLIENT_ERROR_SAMPLE_RATE,
    METRICS_TOKEN,
    SITE_ORIGIN,
    STATIC_DIR,
    TEMPLATES_DIR,
    configure_logging,
)
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
    get_client_bundle,
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


# ---------------------------------------------------------------------------
# Structured request logging + request IDs (O1)
#
# One log line per request through the "discammer" logger, carrying a request
# id (echoed in the X-Request-ID response header) and the request duration.
# Asset/probe 404s (favicon, /sitemap.xml typos, /static misses) log at DEBUG
# so they don't spam INFO; everything else logs at INFO. Unhandled exceptions
# are logged once *with* the rid and re-raised so FastAPI's handlers still run.
# ---------------------------------------------------------------------------

import logging  # noqa: E402
import time as _time_mod  # noqa: E402
from uuid import uuid4  # noqa: E402

from metrics import collector as _metrics_collector  # noqa: E402

_request_logger = configure_logging()

# O2: the metrics endpoint path — excluded from its own RED metrics so a scrape
# never feeds the counters it exposes (no self-counting feedback loop).
_METRICS_PATH = "/api/metrics"


def _route_template(request: "Request", fallback_path: str) -> str:
    """Low-cardinality route label for metrics.

    Prefer the matched route TEMPLATE (e.g. ``/{lang}/journal/{slug}``) so a
    page with a slug doesn't spawn a new series per slug (cardinality blowup +
    potential content leak via the label). Falls back to a coarse bucket when
    no route matched (404s, validation failures): ``<asset>`` for asset/probe
    paths, else ``<other>``.
    """
    route = request.scope.get("route")
    path_format = getattr(route, "path", None) or getattr(route, "path_format", None)
    if path_format:
        return path_format
    if _is_asset_path(fallback_path):
        return "<asset>"
    return "<other>"


def _record_metrics(request: "Request", status: int, duration_s: float) -> None:
    """Feed one observation into the RED collector, skipping the metrics
    endpoint itself."""
    if request.url.path == _METRICS_PATH:
        return
    _metrics_collector.observe(
        method=request.method,
        route=_route_template(request, request.url.path),
        status=status,
        duration_s=duration_s,
    )


@app.middleware("http")
async def request_logging_middleware(request: "Request", call_next):
    rid = request.headers.get("X-Request-ID") or uuid4().hex
    request.state.request_id = rid
    start = _time_mod.perf_counter()

    try:
        response = await call_next(request)
    except Exception:
        # Log the failure once with the rid, then re-raise so FastAPI's
        # exception handlers run and produce the actual response. The
        # ServerErrorMiddleware above us turns this into a 500.
        elapsed = _time_mod.perf_counter() - start
        duration_ms = round(elapsed * 1000, 2)
        # Record the 5xx in RED metrics too (errors are the whole point).
        _record_metrics(request, 500, elapsed)
        _request_logger.exception(
            "request failed",
            extra={
                "rid": rid,
                "method": request.method,
                "path": request.url.path,
                "status": 500,
                "duration_ms": duration_ms,
            },
        )
        raise

    elapsed = _time_mod.perf_counter() - start
    duration_ms = round(elapsed * 1000, 2)
    response.headers["X-Request-ID"] = rid

    # O2: record RED metrics once, here, from the existing middleware (no second
    # middleware). Route TEMPLATE label keeps cardinality bounded.
    _record_metrics(request, response.status_code, elapsed)

    # Asset/probe 404s are noise at INFO — drop them to DEBUG. Reuse the same
    # classifier the 404 handlers use so the two stay in lockstep.
    level = logging.INFO
    if response.status_code == 404 and _is_asset_path(request.url.path):
        level = logging.DEBUG

    _request_logger.log(
        level,
        "%s %s -> %s (%sms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        extra={
            "rid": rid,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )

    # Cache-Control. Previously NOTHING was set, so browsers (notably iOS Safari)
    # applied *heuristic* caching to the HTML: a transient bad/partial response
    # served during a deploy/restart window could get pinned as "fresh" and keep
    # rendering — a persistent blank/black page for that user while every fresh
    # request gets the good page. Two buckets:
    #   - content-hashed JS/CSS (filename changes on every build) -> cache hard.
    #   - everything else, above all HTML -> `no-cache`: store but ALWAYS
    #     revalidate (ETag 304s keep it cheap), so a bad response can never be
    #     served stale and a deploy is picked up on the next load.
    _path = request.url.path
    if "cache-control" not in (k.lower() for k in response.headers.keys()):
        if _path.startswith(("/static/js/", "/static/css/")):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
    return response

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
# A2: the client (island) translation bundle injected into window.__DISCAMMER_I18N__
# so the React islands read one source of truth instead of per-component BUNDLES.
_env.globals["get_client_bundle"] = get_client_bundle


def _localized_url(lang: str, path: str = "") -> str:
    """Build a `/{lang}/path` URL, normalising leading slashes."""
    clean = path.lstrip("/")
    if not clean:
        return f"/{lang}/"
    return f"/{lang}/{clean}"


_env.globals["localized_url"] = _localized_url


def client_runtime_config() -> dict:
    """Non-secret runtime config surfaced to the browser as
    ``window.__DISCAMMER_CONFIG__``. Currently only the client-error beacon
    sample rate so the browser samples crash reports without a rebuild.

    NEVER put secrets or per-user data here — it is rendered verbatim into the
    public page HTML.
    """
    return {"clientErrorSampleRate": CLIENT_ERROR_SAMPLE_RATE}


_env.globals["client_runtime_config"] = client_runtime_config
# Wired into base.html's window.__DISCAMMER_I18N__ <script> as
#     window.__DISCAMMER_CONFIG__ = {{ client_runtime_config() | tojson }};
# (tojson only, never forceescape inside <script>). beacon.ts reads
# window.__DISCAMMER_CONFIG__?.clientErrorSampleRate with a 0.2 fallback.

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
# O1 — privacy-safe client error beacon (POST /api/client-errors)
#
# The browser's IslandErrorBoundary reports a scrubbed signal here when an
# island crashes. Privacy invariants (Hard rules 12/13):
#   * stores NOTHING — no DB, no file, no in-memory retention of payloads;
#   * never logs raw message / stack / any field that could carry user text;
#   * body-size-capped (>~2 KB → 413) before parsing;
#   * sampled client-side AND rate-limited per IP here (over limit → 429, no
#     log line, so a crash loop can't spam the log);
#   * one INFO line per accepted report carrying ONLY the allowlisted, coarse
#     fields {rid, name, message_class, ua_family} after a server-side
#     re-scrub (defense in depth — the client already scrubbed once).
# ---------------------------------------------------------------------------

import re as _re  # noqa: E402

from fastapi import Request, Response as _Response  # noqa: E402

_CLIENT_ERROR_MAX_BODY = 2048  # ~2 KB hard cap on the request body.

# Per-IP token bucket: ip -> (tokens, last_refill_monotonic). Refilled at
# CLIENT_ERROR_RATE_LIMIT tokens/minute. Now genuinely per-IP (see _client_ip),
# so the key space is the client-IP space — hard-capped at
# _CLIENT_ERROR_BUCKET_MAX entries (see _client_error_allow) so a flood of
# distinct IPs can't grow it unboundedly. Cleared in tests.
_client_error_buckets: dict[str, tuple[float, float]] = {}
_CLIENT_ERROR_REFILL_PER_SEC = CLIENT_ERROR_RATE_LIMIT / 60.0
# Hard ceiling on the number of tracked IP buckets. Refill window (seconds) used
# to evict stale buckets before falling back to a full reset.
_CLIENT_ERROR_BUCKET_MAX = 4096
_CLIENT_ERROR_REFILL_WINDOW_SEC = 60.0

# Allowed error *names* are short identifier-ish tokens (JS error class names).
# Anything else is bucketed to "Error" so a smuggled user paragraph in `name`
# can never be echoed verbatim.
_ERROR_NAME_RE = _re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,39}$")
# A messageClass is a coarse non-identifying bucket the client builds, e.g.
# "TypeError/short". Keep only that shape; drop anything with whitespace or
# punctuation that could carry free text.
_MESSAGE_CLASS_RE = _re.compile(r"^[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+)?$")
# Location is a coarse island/component name, not a URL or user content.
_LOCATION_RE = _re.compile(r"^[A-Za-z0-9_.\-]{1,60}$")


def _client_ip(request: "Request") -> str:
    """Best-effort real client IP for per-IP rate limiting.

    Trust assumption: in prod uvicorn is bound to loopback (127.0.0.1:8000) and
    ONLY our nginx reaches it, so the X-Real-IP / X-Forwarded-For headers nginx
    sets (X-Real-IP = $remote_addr = the real peer; X-Forwarded-For's first hop
    likewise) are trustworthy. Prefer those so the limiter is genuinely per-IP
    rather than collapsing to the single proxy/bridge address that
    request.client.host reports behind the proxy. In direct/dev access these
    headers are absent and we fall back to the socket peer.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",", 1)[0].strip()
        if first:
            return first
    client = request.client
    return client.host if client else "unknown"


def _client_error_allow(ip: str) -> bool:
    """Token-bucket admission test. Returns False when the per-IP rate is
    exceeded. Side-effect: decrements the bucket on admit.

    "Per-IP" holds behind our nginx: ``ip`` comes from ``_client_ip`` which
    resolves the real client via the trusted X-Real-IP header, so distinct
    clients get independent buckets even though they share the proxy socket."""
    now = _time_mod.monotonic()
    existing = _client_error_buckets.get(ip)
    if existing is None and len(_client_error_buckets) >= _CLIENT_ERROR_BUCKET_MAX:
        # At the cap and about to add a NEW key — first drop stale buckets
        # (untouched for longer than a full refill window; they'd refill to full
        # anyway). If that doesn't free room, clear the whole dict: a bounded
        # worst-case reset. The limiter just refills fresh — fail-safe for
        # telemetry, never a crash or unbounded memory.
        cutoff = now - _CLIENT_ERROR_REFILL_WINDOW_SEC
        for stale in [k for k, (_, last) in _client_error_buckets.items() if last < cutoff]:
            del _client_error_buckets[stale]
        if len(_client_error_buckets) >= _CLIENT_ERROR_BUCKET_MAX:
            _client_error_buckets.clear()
    tokens, last = existing if existing is not None else (float(CLIENT_ERROR_RATE_LIMIT), now)
    tokens = min(
        float(CLIENT_ERROR_RATE_LIMIT),
        tokens + (now - last) * _CLIENT_ERROR_REFILL_PER_SEC,
    )
    if tokens < 1.0:
        _client_error_buckets[ip] = (tokens, now)
        return False
    _client_error_buckets[ip] = (tokens - 1.0, now)
    return True


def _ua_family(user_agent: str | None) -> str:
    """Coarse, non-identifying browser family. Never the full UA string (which
    can fingerprint). Returns one of a small fixed vocabulary."""
    ua = (user_agent or "").lower()
    if "firefox" in ua:
        return "firefox"
    if "edg" in ua:
        return "edge"
    if "chrome" in ua or "crios" in ua:
        return "chrome"
    if "safari" in ua:
        return "safari"
    if not ua:
        return "unknown"
    return "other"


def _scrub_error_name(value) -> str:
    if isinstance(value, str) and _ERROR_NAME_RE.match(value):
        return value
    return "Error"


def _scrub_message_class(value) -> str:
    if isinstance(value, str) and _MESSAGE_CLASS_RE.match(value):
        return value[:48]
    return "unknown"


def _scrub_location(value) -> str:
    if isinstance(value, str) and _LOCATION_RE.match(value):
        return value
    return "unknown"


@app.post("/api/client-errors", include_in_schema=False)
async def client_errors(request: Request):
    # Body-size cap BEFORE parsing. Honest Content-Length gives a cheap early-out
    # (reject without reading a byte), but it's only a hint: a spoofed-small or
    # absent header (e.g. Transfer-Encoding: chunked) could otherwise slip a huge
    # body through. So we ALSO cap during the streaming read below — we never
    # buffer more than _CLIENT_ERROR_MAX_BODY bytes, aborting as soon as the
    # running total exceeds the cap instead of letting request.body() buffer the
    # whole (possibly enormous) payload into memory first.
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > _CLIENT_ERROR_MAX_BODY:
                return _Response(status_code=413)
        except ValueError:
            return _Response(status_code=413)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > _CLIENT_ERROR_MAX_BODY:
            # Stop reading immediately — bounded allocation regardless of the
            # advertised (or absent) Content-Length.
            return _Response(status_code=413)
    body = bytes(body)

    # Rate-limit per IP. Over limit → 429 with NO log line (no spam).
    if not _client_error_allow(_client_ip(request)):
        return _Response(status_code=429)

    # Parse defensively; a malformed body is simply ignored (still 204 — the
    # beacon is fire-and-forget and we store nothing either way).
    name = "Error"
    message_class = "unknown"
    try:
        import json as _json

        payload = _json.loads(body or b"{}")
        if isinstance(payload, dict):
            # Server-side RE-SCRUB (defense in depth): only the coarse
            # allowlisted fields survive; any smuggled message/stack/pasted/
            # query field is never read.
            name = _scrub_error_name(payload.get("name"))
            message_class = _scrub_message_class(payload.get("messageClass"))
            _ = _scrub_location(payload.get("location"))  # validated, not logged raw
    except (ValueError, TypeError):
        pass

    rid = getattr(request.state, "request_id", None)
    # NB: ``name`` is a reserved LogRecord attribute (the logger name), so the
    # scrubbed error class is attached as ``error_name`` via extra=.
    _request_logger.info(
        "client error beacon",
        extra={
            "rid": rid,
            "error_name": name,
            "message_class": message_class,
            "ua_family": _ua_family(request.headers.get("user-agent")),
        },
    )
    return _Response(status_code=204)


# ---------------------------------------------------------------------------
# O2 — RED metrics exposition (GET /api/metrics)
#
# Prometheus text exposition of the request/error counters + duration histogram
# fed by the request middleware above. Access-gated (Hard rule 13):
#   * METRICS_TOKEN set  → require ``Authorization: Bearer <token>`` (else 401);
#   * METRICS_TOKEN unset → endpoint is closed to the public: a non-local caller
#     gets a 404 (not even advertised); a loopback caller may scrape it (handy
#     for an internal sidecar / curl on the box).
# It is excluded from its own metrics (see ``_record_metrics``) and from the
# asset/probe/FTS classifiers (it lives under /api/, which those skip anyway).
# Labels are method/route-template/status-class only — no path/query/user data.
# ---------------------------------------------------------------------------

# Numeric loopback peers only — request.client.host is a numeric socket address,
# so name literals like "localhost"/"testserver" could never match it (they were
# inert). The TestClient peer host is "testclient", never in this set, so the
# metrics endpoint stays closed (404) to it when METRICS_TOKEN is unset.
_LOOPBACK_HOSTS = {"127.0.0.1", "::1"}


def _is_local_request(request: Request) -> bool:
    client = request.client
    host = client.host if client else ""
    return host in _LOOPBACK_HOSTS


@app.get("/api/metrics", include_in_schema=False)
async def metrics_endpoint(request: Request):
    token = METRICS_TOKEN
    if token:
        auth = request.headers.get("authorization", "")
        expected = f"Bearer {token}"
        # Constant-time-ish compare; both are short server-controlled strings.
        if auth != expected:
            return _Response(status_code=401)
    else:
        # Closed to the public — only a loopback caller may scrape an unset-token
        # deployment; everyone else gets a 404 so the surface isn't advertised.
        if not _is_local_request(request):
            return _Response(status_code=404)

    from metrics import collector as _c

    return _Response(
        content=_c.render(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


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
