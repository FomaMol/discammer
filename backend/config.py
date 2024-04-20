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
