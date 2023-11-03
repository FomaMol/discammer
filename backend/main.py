import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from config import STATIC_DIR, TEMPLATES_DIR
from database import init_db
from seed_data import seed_database

# Ensure the backend package is on sys.path so sibling imports work when
# running with ``uvicorn main:app`` from the backend directory.
_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)


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

# Jinja2 templates — stored on app.state so routers can access them
# Workaround: Python 3.14 + Jinja2 LRUCache incompatibility —
# create the environment with caching disabled and pass it directly.
from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402

from datetime import datetime, timezone  # noqa: E402

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(),
    auto_reload=True,
    cache_size=0,
)


def _asset_url(path: str) -> str:
    """Append ?v=<file mtime> to a /static URL so browsers re-fetch after deploy.

    Vite emits stable filenames (no hash in name) so without a query string
    the browser keeps the old CSS/JS until manually cleared.
    """
    rel = path.removeprefix("/static/")
    target = STATIC_DIR / rel
    try:
        mtime = int(target.stat().st_mtime)
    except OSError:
        return path
    sep = "&" if "?" in path else "?"
    return f"{path}{sep}v={mtime}"


# Expose `now()` to templates for things like dynamic copyright years.
_env.globals["now"] = lambda: datetime.now(timezone.utc)
_env.globals["asset_url"] = _asset_url
app.state.templates = Jinja2Templates(env=_env)

# Routers
from routers.pages import router as pages_router  # noqa: E402
from routers.api import router as api_router  # noqa: E402
from routers.game import router as game_router  # noqa: E402

app.include_router(pages_router)
app.include_router(api_router)
app.include_router(game_router)
