import json
import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
CONTENT_DIR = BASE_DIR / "content"
DATA_DIR = BASE_DIR / "data"
TEMPLATES_DIR = BACKEND_DIR / "templates"
STATIC_DIR = BACKEND_DIR / "static"
DATABASE_PATH = DATA_DIR / "discammer.db"

# Canonical public origin for absolute SEO URLs (canonical, og:*, hreflang,
# sitemap, RSS). Deriving these from request.base_url emits http:// behind the
# prod nginx proxy: uvicorn only trusts X-Forwarded-* from loopback, and the
# proxy connects from the Docker bridge.
SITE_ORIGIN = os.environ.get("SITE_ORIGIN", "https://discammer.com").rstrip("/")

# Whether ``seed_database()`` wipes + reseeds the content tables on startup.
# Defaults to on. Set SEED_ON_STARTUP=0 (or "false"/"") to skip the reseed —
# useful when running multiple worker processes so only one process (or an
# out-of-band job) performs the wipe instead of every worker racing on it.
SEED_ON_STARTUP = os.environ.get("SEED_ON_STARTUP", "1") not in ("0", "false", "False", "")

# Build identifier surfaced by /api/health. The deploy pipeline passes the
# short git SHA as a build-arg → ENV; locally it stays "dev".
GIT_SHA = os.environ.get("GIT_SHA", "dev")

# Site search capability flag (Task F1). The seeder builds an FTS5 virtual
# table (``content_fts``) on startup; if the live SQLite build was compiled
# without FTS5 this is flipped to False and ``search_content`` falls back to a
# LIKE scan. Default on — most SQLite builds (incl. the macOS/py3.14 one here)
# ship FTS5. ``seed_data.build_search_index`` probes for it at startup and
# downgrades this flag if the CREATE VIRTUAL TABLE raises.
SEARCH_ENABLED = True

# Structured request logging format for the "discammer" logger. "text" emits a
# readable single line; "json" emits a one-line JSON object (easier to ship to
# a log aggregator). Dependency-free — see ``configure_logging`` below.
LOG_FORMAT = os.environ.get("LOG_FORMAT", "text")

# Log level for the "discammer" logger's own handler.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


# ---------------------------------------------------------------------------
# Observability (O1 client-error beacon + O2 metrics)
# ---------------------------------------------------------------------------

# Fraction of caught client-side island crashes the browser actually reports to
# /api/client-errors (the rest are dropped client-side via Math.random). Kept
# low so a crash loop can't flood the endpoint. Surfaced to the browser through
# the ``client_runtime_config`` Jinja global (window.__DISCAMMER_CONFIG__).
def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


CLIENT_ERROR_SAMPLE_RATE = _env_float("CLIENT_ERROR_SAMPLE_RATE", 0.2)

# Per-IP token-bucket ceiling (requests/minute) for /api/client-errors. Over the
# limit returns 429 with NO log line, so a misbehaving client can't spam logs.
# "Per-IP" holds behind our nginx: main._client_ip resolves the real client from
# the trusted X-Real-IP header (uvicorn is loopback-bound; only nginx reaches
# it), so each client gets its own bucket rather than sharing the proxy's.
CLIENT_ERROR_RATE_LIMIT = _env_int("CLIENT_ERROR_RATE_LIMIT", 30)

# Bearer token gating GET /api/metrics. Empty (the default) means the endpoint
# is closed to the public — non-local callers get a 404 so the surface isn't
# even advertised. Set METRICS_TOKEN=<secret> to expose it to an authenticated
# scraper.
METRICS_TOKEN = os.environ.get("METRICS_TOKEN", "")

# SEO-3 — IndexNow key. When set, the origin serves the key-ownership file at
# `GET /<key>.txt` (see routers/seo.py) so Bing/Yandex can verify that whoever
# submits URLs via the IndexNow API controls this host. Empty (the default)
# keeps that route closed (404) — the feature is opt-in and adds no public
# surface until the owner provisions a key. The key must be 8–128 characters
# from [a-zA-Z0-9-] per the IndexNow spec; a malformed value is treated as
# unset so a typo can't publish a bogus ownership file.
INDEXNOW_KEY = os.environ.get("INDEXNOW_KEY", "")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


# ---------------------------------------------------------------------------
# Security (SEC-1 CSP + headers, SEC-2 rate limiting)
# ---------------------------------------------------------------------------

# Content-Security-Policy. Shipped in Report-Only first (reports violations,
# blocks nothing) so the strict policy can be validated against the real pages —
# islands, the WebGL hero, Plyr, embedded video iframes — before enforcing. Flip
# CSP_REPORT_ONLY=0 to enforce once reports are clean. CSP_ENABLED=0 disables it
# entirely. See backend/security.py for the policy itself.
CSP_ENABLED = _env_bool("CSP_ENABLED", True)
CSP_REPORT_ONLY = _env_bool("CSP_REPORT_ONLY", True)
# Where the browser POSTs violation reports. Empty disables the report-uri
# directive (and the endpoint stays harmless/unused).
CSP_REPORT_URI = os.environ.get("CSP_REPORT_URI", "/api/csp-report")
# Extra space-separated connect-src hosts (e.g. "https://static.cloudflareinsights.com"
# when the CF Web Analytics beacon — CF-9 — is enabled).
CSP_CONNECT_EXTRA = os.environ.get("CSP_CONNECT_EXTRA", "")

# Per-IP token-bucket ceiling (requests/minute) applied to the public read
# endpoints under /api/* (posts/guides/course/search) as origin-side defense in
# depth behind the Cloudflare edge rate limit (CF-6). Excludes /api/health
# (monitors must never be throttled), /api/metrics, and the beacon/CSP endpoints
# which carry their own stricter limiters. 0 disables. Calibrate against the
# PERF-4 baseline (docs/deploy/capacity.md).
API_RATE_LIMIT = _env_int("API_RATE_LIMIT", 240)

# Per-IP ceiling (requests/minute) for the CSP violation report sink. Reports can
# burst from a single broken page load, so this is generous but bounded.
CSP_REPORT_RATE_LIMIT = _env_int("CSP_REPORT_RATE_LIMIT", 60)

# ---------------------------------------------------------------------------
# UX-4 — course progress sync (POST /api/sync/{push,pull,delete})
# ---------------------------------------------------------------------------

# Per-IP ceiling (requests/minute) for the sync endpoints. These are the app's
# only write path, so they get a stricter bucket than the 240/min general read
# budget: 20/min is far above a real user (auto-push is debounced client-side)
# and far below anything useful for hammering the store. NB: rate limiting does
# NOT protect the blob's contents — a blob is fetched once and attacked offline.
# The code's 128 bits of entropy is what protects it; this bucket only protects
# the server's disk and CPU.
SYNC_RATE_LIMIT = _env_int("SYNC_RATE_LIMIT", 20)

# Hard cap (bytes) on the encrypted blob request body, enforced before parsing.
# A Dossier is a few KB (9 modules of lessons + exam + cert name + guide
# checklists), so 64 KB is headroom rather than a limit users can reach.
SYNC_MAX_BODY = _env_int("SYNC_MAX_BODY", 65536)

# Blobs untouched for this long are swept (owner decision 2026-07-15). Without an
# email we cannot know a code is abandoned, so an unused blob must age out on its
# own. Every push and pull refreshes last_seen_at, so an active user never loses
# anything. Consumed by the sweep added in the next task.
SYNC_BLOB_TTL_DAYS = _env_int("SYNC_BLOB_TTL_DAYS", 365)


# ---------------------------------------------------------------------------
# Logging configuration
#
# The request middleware in ``main.py`` logs one record per request through the
# "discammer" logger, attaching the request id / method / path / status /
# duration as record attributes (via ``extra=``). The formatters below render
# those attributes. ``propagate`` is turned off so the root logger (uvicorn's)
# doesn't re-emit our line, and ``configure_logging`` is idempotent so importing
# this module twice (or calling it again at startup) doesn't stack handlers.
# ---------------------------------------------------------------------------

# Attributes the middleware attaches via ``logging`` ``extra=`` and that the
# JSON formatter should surface when present on the record. Also includes the
# scrubbed client-error beacon fields (O1) so a JSON log shipper surfaces
# {name, message_class, ua_family} — all coarse, non-identifying buckets, never
# raw user content.
_REQUEST_LOG_FIELDS = (
    "rid",
    "method",
    "path",
    "status",
    "duration_ms",
    "error_name",
    "message_class",
    "ua_family",
    # SEC-1 CSP report sink — coarse violation shape only.
    "csp_directive",
    "csp_blocked",
)


class _JsonLogFormatter(logging.Formatter):
    """Render a log record as a one-line JSON object.

    Always includes time/level/logger/msg; folds in any of the request fields
    (rid/method/path/status/duration_ms) that the record carries, plus the
    exception text when present.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for field in _REQUEST_LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


_LOGGING_CONFIGURED = False


def configure_logging() -> logging.Logger:
    """Configure and return the "discammer" logger (idempotent).

    Attaches a single stream handler whose formatter is chosen by ``LOG_FORMAT``
    and disables propagation so the line isn't duplicated through the root
    logger. Calling this more than once is a no-op after the first call.
    """
    global _LOGGING_CONFIGURED
    logger = logging.getLogger("discammer")
    if _LOGGING_CONFIGURED:
        return logger

    handler = logging.StreamHandler()
    if LOG_FORMAT.lower() == "json":
        handler.setFormatter(_JsonLogFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(getattr(logging, LOG_LEVEL.upper(), logging.INFO))
    logger.propagate = False
    _LOGGING_CONFIGURED = True
    return logger
