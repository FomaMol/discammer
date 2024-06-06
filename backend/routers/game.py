"""Serve the Unity WebGL game bundle at /play/.

The build files under backend/game_build/Build/ are pre-compressed by Unity
(*.data.br, *.framework.js.br, *.wasm.br). We must label them with the right
inner Content-Type and Content-Encoding: br so the browser decompresses them
in flight — otherwise the loader fails with "unexpected magic number" or
"failed to download".
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from config import BACKEND_DIR

GAME_BUILD_DIR = (BACKEND_DIR / "game_build").resolve()

router = APIRouter(prefix="/play", tags=["game"])


# Inner Content-Type for files whose outermost extension is .br.
# Any .br file not matching here still gets Content-Encoding: br set, with
# application/octet-stream as the inner type — so unknown future Unity assets
# (e.g. *.symbols.json.br) never silently ship as raw brotli bytes.
_INNER_BROTLI_TYPES = {
    ".wasm": "application/wasm",
    ".js": "application/javascript",
    ".data": "application/octet-stream",
}

_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
_SHORT_CACHE = "public, max-age=86400"


def _brotli_content_type(name: str) -> str | None:
    """Return inner Content-Type for any .br asset, or None if not brotlified."""
    if not name.endswith(".br"):
        return None
    inner = name[:-3]
    for ext, ctype in _INNER_BROTLI_TYPES.items():
        if inner.endswith(ext):
            return ctype
    return "application/octet-stream"


def _cache_control_for(relpath: Path) -> str:
    """Build/ contains version-stamped (web_gl_build_10.*) immutable assets.
    Loadscreen/ assets change with the build but reference is by name; keep
    short cache. index.html must never be cached (same policy as /play/),
    or a stale copy keeps referencing pruned version-stamped assets for a day.
    """
    parts = relpath.parts
    if parts and parts[0] == "Build":
        return _IMMUTABLE_CACHE
    if relpath == Path("index.html"):
        return "no-cache"
    return _SHORT_CACHE


@router.api_route("", methods=["GET", "HEAD"])
async def play_root_no_slash():
    """Redirect /play -> /play/ so relative asset paths in index.html resolve."""
    return RedirectResponse(url="/play/", status_code=307)


@router.api_route("/", methods=["GET", "HEAD"])
async def play_index():
    index = GAME_BUILD_DIR / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="Game build not installed")
    return FileResponse(
        index,
        media_type="text/html",
        headers={"Cache-Control": "no-cache"},
    )


@router.api_route("/{path:path}", methods=["GET", "HEAD"])
async def play_asset(path: str):
    target = (GAME_BUILD_DIR / path).resolve()
    try:
        relpath = target.relative_to(GAME_BUILD_DIR)
    except ValueError:
        raise HTTPException(status_code=404, detail="Path outside game build")

    if not target.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    cache = _cache_control_for(relpath)
    brotli_ctype = _brotli_content_type(target.name)
    if brotli_ctype:
        return FileResponse(
            target,
            media_type=brotli_ctype,
            headers={"Content-Encoding": "br", "Cache-Control": cache},
        )

    return FileResponse(target, headers={"Cache-Control": cache})
