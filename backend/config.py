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

# Structured request logging format for the "discammer" logger. "text" emits a
# readable single line; "json" emits a one-line JSON object (easier to ship to
# a log aggregator). Dependency-free — see ``configure_logging`` below.
LOG_FORMAT = os.environ.get("LOG_FORMAT", "text")

# Log level for the "discammer" logger's own handler.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


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
# JSON formatter should surface when present on the record.
_REQUEST_LOG_FIELDS = ("rid", "method", "path", "status", "duration_ms")


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
