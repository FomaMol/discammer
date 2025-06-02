import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import (
    API_RATE_LIMIT,
    CLIENT_ERROR_RATE_LIMIT,
    CLIENT_ERROR_SAMPLE_RATE,
    CSP_REPORT_RATE_LIMIT,
    GIT_SHA,
    METRICS_TOKEN,
    SITE_ORIGIN,
    STATIC_DIR,
    SYNC_BLOB_TTL_DAYS,
    SYNC_MAX_BODY,
    SYNC_RATE_LIMIT,
    TEMPLATES_DIR,
    configure_logging,
)
from database import init_db, sync_delete, sync_get, sync_put, sync_sweep
from ratelimit import RateLimiter
from security import apply_security_headers, generate_nonce
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
    # UX-4: age out abandoned sync blobs. Cheap, and already serialized across
    # workers by init_db's flock having run first. Goes through the same gate as
    # the push path so the two triggers cannot sweep twice over one interval.
    await _sync_sweep_if_due()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

# Deployed application version. Kept as one constant so the OpenAPI metadata and
# the OBS-1 build-info gauge (set below) never drift apart.
APP_VERSION = "1.0.0"

app = FastAPI(
    title="DiScammer",
    description="Cybersecurity education platform",
    version=APP_VERSION,
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

# OBS-1: register the build-info gauge once, at import, so /api/metrics can
# correlate an error spike with the deployed release. GIT_SHA is a build id
# (the deploy pipeline passes the short SHA; "dev" locally), not PII.
_metrics_collector.set_build_info(version=APP_VERSION, git_sha=GIT_SHA)

_request_logger = configure_logging()

# O2: the metrics endpoint path — excluded from its own RED metrics so a scrape
# never feeds the counters it exposes (no self-counting feedback loop).
_METRICS_PATH = "/api/metrics"

# ---------------------------------------------------------------------------
# Rate limiters (SEC-2). One per concern, each an in-process per-IP token bucket
# (see backend/ratelimit.py). Per-worker — the Cloudflare edge limit (CF-6) is
# the global limiter; these are origin-side defense in depth.
# ---------------------------------------------------------------------------
# General read-API limiter (posts/guides/course/search). Excludes the paths
# below: /api/health (monitors must never be throttled), /api/metrics (gated
# separately), and the beacon/CSP sinks which have their own stricter buckets.
_api_limiter = RateLimiter(API_RATE_LIMIT)
_csp_report_limiter = RateLimiter(CSP_REPORT_RATE_LIMIT)
# UX-4: sync gets its own, stricter bucket — it is the app's only write path, and
# a write to disk deserves a tighter budget than a read from cache.
_sync_limiter = RateLimiter(SYNC_RATE_LIMIT)
# Paths under /api/ the general limiter must NOT touch: they either must never be
# throttled (health), are gated separately (metrics), or carry their own stricter
# bucket and would otherwise be counted twice.
_API_RATE_LIMIT_EXEMPT = frozenset(
    {
        "/api/health",
        "/api/metrics",
        "/api/client-errors",
        "/api/csp-report",
        "/api/sync/push",
        "/api/sync/pull",
        "/api/sync/delete",
    }
)


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


def _safe_error_kind(name: str) -> str:
    """Bound the cardinality of the OBS-1 error-events ``kind`` label.

    Exception class names are developer/library-controlled, but this defensively
    guarantees no unexpected string can widen the label: return ``name`` only when
    it is a Python identifier of at most 64 chars, else the catch-all ``"Other"``."""
    if isinstance(name, str) and len(name) <= 64 and name.isidentifier():
        return name
    return "Other"


# The only client-error ``kind`` values the metric will emit. Unlike the server
# path (code-controlled exception class names), the client ``name`` arrives from
# the PUBLIC, unauthenticated beacon (POST /api/client-errors), so shape-checking
# is not enough: an anonymous caller could otherwise mint an unbounded set of
# identifier-shaped label values, each a new Prometheus series + a never-trimmed
# key in the collector (a cardinality / memory soft-DoS). This strict allowlist
# covers the JS built-in error classes plus the common DOMException ``.name``
# values; everything else buckets to ``"Other"``.
_CLIENT_ERROR_KINDS = frozenset(
    {
        "Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError",
        "TypeError", "URIError", "AggregateError", "InternalError",
        "AbortError", "NotAllowedError", "NotFoundError", "NotSupportedError",
        "SecurityError", "NetworkError", "QuotaExceededError", "TimeoutError",
        "TypeMismatchError", "InvalidStateError", "OperationError", "DataError",
    }
)


def _client_error_kind(name: str) -> str:
    """Bound the OBS-1 client error-events ``kind`` label to a strict allowlist.

    The client error name comes from the public, unauthenticated beacon, so —
    unlike the server path — a shape check is insufficient. Only a known error
    name passes; anything else buckets to ``"Other"`` so no anonymous caller can
    widen metric cardinality or grow the collector's series set unboundedly."""
    return name if name in _CLIENT_ERROR_KINDS else "Other"


# ---------------------------------------------------------------------------
# AN-1 — privacy-first product-usage surface counter.
#
# Maps a CANONICAL localized page route TEMPLATE (never a concrete slug) to a
# coarse surface NAME, so we can see WHICH surface a reader loaded without any
# user tracking, cookies, slugs, or raw checker/inspector input. The checker and
# inspector are counted by surface name only (tools_check / tools_inspect); their
# pasted text runs entirely in the browser and never reaches the server, so there
# is nothing here that could capture it. Cardinality is tiny (~13 surfaces × 2
# langs). Fed from `_record_surface_view` in the request middleware.
# ---------------------------------------------------------------------------
_SURFACE_BY_ROUTE: dict[str, str] = {
    "/{lang}/": "home",
    "/{lang}": "home",
    "/{lang}/journal": "journal",
    "/{lang}/journal/{slug}": "post",
    "/{lang}/guide/{slug}": "guide",
    "/{lang}/course": "course",
    "/{lang}/course/{module_slug}": "module",
    "/{lang}/course/{module_slug}/{lesson_slug}": "lesson",
    "/{lang}/game": "game",
    "/{lang}/about": "about",
    "/{lang}/portfolio": "portfolio",
    "/{lang}/check": "tools_check",
    "/{lang}/inspect": "tools_inspect",
    "/{lang}/search": "search",
}
# The only language labels we will emit — a defensive allowlist so a malformed
# path param can never widen the surface counter's cardinality.
_SURFACE_LANGS = frozenset({"en", "ru"})


def _record_surface_view(request: "Request", response) -> None:
    """AN-1: record ONE product-usage surface view.

    Records only when ALL hold: method is GET; the response is a 2xx; the matched
    route TEMPLATE is a known page surface; and the response is HTML. The labels
    are the coarse surface NAME and the UI language (``en``/``ru``) only — never a
    slug, path, query string, request body, IP, or any user content. Deriving the
    surface from the route *template* (via ``_route_template``) is what guarantees
    a slug can never enter the label: a per-slug path collapses to one template
    key like ``/{lang}/guide/{slug}`` before the mapping lookup.
    """
    if request.method != "GET":
        return
    status = response.status_code
    if not (200 <= status < 300):
        return
    surface = _SURFACE_BY_ROUTE.get(_route_template(request, request.url.path))
    if surface is None:
        return
    if not response.headers.get("content-type", "").startswith("text/html"):
        return
    lang = request.path_params.get("lang")
    if lang not in _SURFACE_LANGS:
        return
    _metrics_collector.observe_surface(surface=surface, lang=lang)


@app.middleware("http")
async def request_logging_middleware(request: "Request", call_next):
    rid = request.headers.get("X-Request-ID") or uuid4().hex
    request.state.request_id = rid
    # SEC-1: per-request CSP nonce, exposed to templates as
    # request.state.csp_nonce so inline <script> blocks can carry it.
    request.state.csp_nonce = generate_nonce()
    start = _time_mod.perf_counter()

    # SEC-2: origin-side per-IP rate limit on the public read API. Over the
    # limit → 429 with no log line (no spam), Retry-After hints a backoff.
    # Skips the exempt paths (health/metrics/own-limiter endpoints).
    _path = request.url.path
    if (
        _path.startswith("/api/")
        and _path not in _API_RATE_LIMIT_EXEMPT
        and not _api_limiter.allow(_client_ip(request))
    ):
        return _Response(status_code=429, headers={"Retry-After": "60"})

    try:
        response = await call_next(request)
    except Exception as exc:
        # Log the failure once with the rid, then re-raise so FastAPI's
        # exception handlers run and produce the actual response. The
        # ServerErrorMiddleware above us turns this into a 500.
        elapsed = _time_mod.perf_counter() - start
        duration_ms = round(elapsed * 1000, 2)
        # Record the 5xx in RED metrics too (errors are the whole point).
        _record_metrics(request, 500, elapsed)
        # OBS-1: also record a bounded server error EVENT so a 5xx spike (rising
        # source="server") and a new error type (a new `kind`) are visible and
        # alertable on /api/metrics. The kind is the guarded exception class name
        # only — never a message, stack, URL, query, or any user content.
        _metrics_collector.observe_error_event(
            source="server", kind=_safe_error_kind(type(exc).__name__)
        )
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
    # AN-1: record the product-usage surface view (privacy-first, PII-free) on
    # the same normal path — never on the 500/exception branch above.
    _record_surface_view(request, response)

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
    if "cache-control" not in (k.lower() for k in response.headers.keys()):
        if _path.startswith(("/static/js/", "/static/css/")):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"

    # SEC-1: security headers on HTML documents only (CSP/X-Frame-Options/etc.
    # are document-level — pointless on JSON/asset responses). The nonce in the
    # CSP matches the one rendered into this page's inline <script> tags. The
    # Unity game (/play/) gets the hardening headers but NOT the nonce CSP — its
    # static engine-generated HTML can't be nonce'd and needs WASM eval — and
    # answers SAMEORIGIN instead of DENY: /{lang}/game embeds /play/ in a
    # same-origin iframe (GameLauncher), which DENY breaks with a
    # "refused to connect" frame.
    if response.headers.get("content-type", "").startswith("text/html"):
        _is_play = _path == "/play" or _path.startswith("/play/")
        apply_security_headers(
            response,
            request.state.csp_nonce,
            include_csp=not _is_play,
            same_origin_framing=_is_play,
        )

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


def _absolute_url(path: str = "/") -> str:
    """Absolutise a site-relative path against the configured public origin.

    The single template-side helper for the "absolute URLs come from
    config.SITE_ORIGIN, never from the request" rule that base.html's `_origin`
    already documents for canonical/og/hreflang. NOT request.url / base_url:
    their scheme comes from the same untrusted ASGI scope, and behind the prod
    nginx proxy that reports http:// (uvicorn only trusts X-Forwarded-* from
    loopback, while the proxy connects from the Docker bridge). Anything that
    disagrees with the canonical on scheme+host — BreadcrumbList `item`, JSON-LD
    `url` — reads to Google as a different page.

    Already-absolute inputs pass through so callers can hand it a full URL.
    """
    if path.startswith(("http://", "https://")):
        return path
    return f"{SITE_ORIGIN}/{path.lstrip('/')}"


_env.globals["absolute_url"] = _absolute_url


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

# Per-IP token bucket for the beacon (SEC-2: now the shared RateLimiter). The
# module-level ``_client_error_buckets`` alias points at the limiter's live
# bucket store so existing tests that clear it keep working unchanged.
_client_error_limiter = RateLimiter(CLIENT_ERROR_RATE_LIMIT)
_client_error_buckets = _client_error_limiter.buckets

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
    """Token-bucket admission test (delegates to the shared RateLimiter).

    "Per-IP" holds behind our nginx: ``ip`` comes from ``_client_ip`` which
    resolves the real client via the trusted X-Real-IP header, so distinct
    clients get independent buckets even though they share the proxy socket."""
    return _client_error_limiter.allow(ip)


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

    # OBS-1: record the client error type as an error event so client crash
    # types/spikes are visible + alertable on /api/metrics. Reads NO new payload
    # field (`name` is the same coarse value the beacon logs today), and the
    # metric label is passed through the strict `_client_error_kind` allowlist so
    # the public beacon can't inflate metric cardinality. The privacy boundary
    # (store nothing, coarse fields only) is unchanged.
    _metrics_collector.observe_error_event(
        source="client", kind=_client_error_kind(name)
    )

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
# SEC-1 — CSP violation report sink (POST /api/csp-report)
#
# Where browsers POST Content-Security-Policy-Report-Only violations during the
# bake-in period. Same privacy posture as the client-error beacon: stores
# NOTHING, body-capped before parsing, per-IP rate-limited (no log spam), and
# logs only the COARSE shape of a violation — the violated directive and the
# SCHEME+HOST of the blocked URI (never the full path/query, which are our own
# URLs but kept minimal anyway). One line per report, at INFO, so a week of
# Report-Only surfaces what the strict policy would block before we enforce.
# ---------------------------------------------------------------------------

_CSP_REPORT_MAX_BODY = 8192  # CSP reports are small JSON; 8 KB is generous.
# A directive token is a short keyword like "script-src" / "frame-src".
_CSP_DIRECTIVE_RE = _re.compile(r"^[a-z][a-z0-9\-]{0,39}$")


def _csp_blocked_origin(value) -> str:
    """Reduce a blocked-uri to scheme://host (or a coarse keyword like
    'inline'/'eval'/'data'); drop path/query entirely."""
    if not isinstance(value, str) or not value:
        return "unknown"
    low = value.lower()
    if low in ("inline", "eval", "self", "data", "blob"):
        return low
    try:
        from urllib.parse import urlparse

        p = urlparse(value)
        if p.scheme and p.hostname:
            return f"{p.scheme}://{p.hostname}"
        if p.scheme:
            return f"{p.scheme}:"
    except ValueError:
        pass
    return "other"


@app.post("/api/csp-report", include_in_schema=False)
async def csp_report(request: Request):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > _CSP_REPORT_MAX_BODY:
                return _Response(status_code=413)
        except ValueError:
            return _Response(status_code=413)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > _CSP_REPORT_MAX_BODY:
            return _Response(status_code=413)
    body = bytes(body)

    if not _csp_report_limiter.allow(_client_ip(request)):
        return _Response(status_code=429)

    directive = "unknown"
    blocked = "unknown"
    try:
        import json as _json

        payload = _json.loads(body or b"{}")
        # report-uri sends {"csp-report": {...}}; tolerate a bare object too.
        report = payload.get("csp-report", payload) if isinstance(payload, dict) else {}
        if isinstance(report, dict):
            d = report.get("effective-directive") or report.get("violated-directive") or ""
            d = d.split()[0] if isinstance(d, str) and d else ""
            if _CSP_DIRECTIVE_RE.match(d):
                directive = d
            blocked = _csp_blocked_origin(report.get("blocked-uri"))
    except (ValueError, TypeError):
        pass

    _request_logger.info(
        "csp violation",
        extra={
            "rid": getattr(request.state, "request_id", None),
            "csp_directive": directive,
            "csp_blocked": blocked,
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


# ---------------------------------------------------------------------------
# UX-4 — course progress sync (POST /api/sync/{push,pull,delete})
#
# Privacy model: the client derives blob_id and enc_key from one 128-bit secret
# via HKDF and only blob_id ever reaches us. The blob is AES-GCM ciphertext we
# hold no key for. Nothing in this section may interpret it — the base64 decode
# below is a transport concern (JSON has no byte type), and the bytes it yields
# go straight to storage unread.
#
# Design notes, each load-bearing:
#   * blob_id travels in the BODY, never the URL. A path would land it in nginx
#     access logs, and blob_id grants read+delete on the blob. This also happens
#     to be why these are POSTs rather than a RESTful GET/DELETE pair.
#   * Body-size-capped BEFORE parsing, the same two-layer guard as the beacon
#     above (Content-Length early-out + streaming cap).
#   * Own per-IP bucket, stricter than the general read limiter, and exempted
#     from that limiter so a push is not billed twice.
#   * delete exists so a user can actually erase their data, not merely stop
#     sending it.
# ---------------------------------------------------------------------------

import base64 as _b64  # noqa: E402
import json as _json_mod  # noqa: E402

# Strict canonical form: exactly 64 lowercase hex characters, the hex encoding of
# HKDF's 32-byte 'id' output. fullmatch, not match: `$` also matches BEFORE a
# trailing newline, so `^[0-9a-f]{64}$` would admit "aaa...a\n" as a distinct id
# for the same blob.
_SYNC_BLOB_ID_RE = _re.compile(r"[0-9a-f]{64}")


async def _read_capped_sync_body(request: "Request") -> bytes | None:
    """Read the body, never buffering past SYNC_MAX_BODY. None => too large.

    Content-Length is a cheap early-out but only a hint (it can be spoofed small
    or absent under chunked encoding), so the streaming read is capped too.
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > SYNC_MAX_BODY:
                return None
        except ValueError:
            return None
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > SYNC_MAX_BODY:
            return None
    return bytes(body)


def _sync_blob_id(payload) -> str | None:
    """Extract a well-formed blob_id, or None. Validated before any DB contact."""
    if not isinstance(payload, dict):
        return None
    blob_id = payload.get("blob_id")
    if isinstance(blob_id, str) and _SYNC_BLOB_ID_RE.fullmatch(blob_id):
        return blob_id
    return None


async def _sync_request(request: "Request") -> tuple[str, dict] | _Response:
    """Shared prologue for all three endpoints: cap, throttle, parse, validate.

    Returns ``(blob_id, payload)`` or the error Response to send back. The order
    is deliberate and identical to the beacon's: size before parse (never
    allocate for a body we will reject), throttle before work.
    """
    body = await _read_capped_sync_body(request)
    if body is None:
        return _Response(status_code=413)
    if not _sync_limiter.allow(_client_ip(request)):
        return _Response(status_code=429, headers={"Retry-After": "60"})
    try:
        payload = _json_mod.loads(body)
    except ValueError:
        return _Response(status_code=400)
    blob_id = _sync_blob_id(payload)
    if blob_id is None:
        return _Response(status_code=400)
    return blob_id, payload


# Sweep at most once a day. Neither obvious trigger works alone: startup only is
# too rare for a process that stays up for months, and per-push is write
# amplification against the one table holding user data. The gate makes the push
# path the clock without paying for it on every write.
_SYNC_SWEEP_INTERVAL_SEC = 86400.0

# None means "not swept in this process yet", which is NOT the same as 0.0.
# time.monotonic()'s reference point is undefined by contract, so a 0.0 sentinel
# would silently mean "swept a very long time ago" on platforms that count from
# boot and "swept just now" on any that count from process start — the first
# sweep would then depend on the platform. None says what is meant.
_sync_last_sweep: float | None = None


async def _sync_sweep_if_due() -> None:
    """Run the TTL sweep if the interval has elapsed. Cheap no-op otherwise.

    Called from the push path and from startup, so it is the single place the
    sweep can fire; startup going through the same gate is what stops the first
    push of a fresh process from re-sweeping seconds after boot.
    """
    global _sync_last_sweep
    now = time.monotonic()
    if (
        _sync_last_sweep is not None
        and now - _sync_last_sweep < _SYNC_SWEEP_INTERVAL_SEC
    ):
        return
    _sync_last_sweep = now
    await sync_sweep(SYNC_BLOB_TTL_DAYS)


@app.post("/api/sync/push", include_in_schema=False)
async def sync_push(request: Request):
    prepared = await _sync_request(request)
    if isinstance(prepared, _Response):
        return prepared
    blob_id, payload = prepared

    blob = payload.get("blob")
    if not isinstance(blob, str) or not blob:
        return _Response(status_code=400)
    try:
        # validate=True so a blob with junk outside the base64 alphabet is a 400
        # rather than being silently truncated into a blob that can never decrypt.
        ciphertext = _b64.b64decode(blob, validate=True)
    except (ValueError, _b64.binascii.Error):
        return _Response(status_code=400)
    if not ciphertext:
        return _Response(status_code=400)

    await sync_put(blob_id, ciphertext)
    # The blob is committed by now, so the user's write has already succeeded and
    # nothing the sweep does can change that. Housekeeping rides along on this
    # path only because a long-lived process needs some clock; it is not part of
    # the push, and it must not be able to fail one. A 'database is locked' after
    # the busy_timeout would otherwise report a stored blob as an error, which the
    # client maps to 'error' — the worst kind of wrong: alarming and false.
    try:
        await _sync_sweep_if_due()
    except Exception:
        _request_logger.exception("sync sweep failed", extra={"path": "/api/sync/push"})
    return _Response(status_code=204)


@app.post("/api/sync/pull", include_in_schema=False)
async def sync_pull(request: Request):
    prepared = await _sync_request(request)
    if isinstance(prepared, _Response):
        return prepared
    blob_id, _payload = prepared

    found = await sync_get(blob_id)
    if found is None:
        return _Response(status_code=404)
    ciphertext, updated_at = found
    # no-store: this is user data, and an intermediary caching it would hand the
    # blob to whoever shares that cache.
    return JSONResponse(
        {"blob": _b64.b64encode(ciphertext).decode(), "updated_at": updated_at},
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/sync/delete", include_in_schema=False)
async def sync_delete_endpoint(request: Request):
    prepared = await _sync_request(request)
    if isinstance(prepared, _Response):
        return prepared
    blob_id, _payload = prepared

    await sync_delete(blob_id)
    return _Response(status_code=204)
