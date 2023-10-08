"""Serve the Unity WebGL game bundle at /play/.

The build files under backend/game_build/Build/ are pre-compressed by Unity
(*.data.br, *.framework.js.br, *.wasm.br). We must label them with the right
inner Content-Type and Content-Encoding: br so the browser decompresses them
in flight — otherwise the loader fails with "unexpected magic number" or
"failed to download".
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse

from config import BACKEND_DIR

GAME_BUILD_DIR = (BACKEND_DIR / "game_build").resolve()

router = APIRouter(prefix="/play", tags=["game"])


_BROTLI_TYPES = {
    ".wasm.br": "application/wasm",
    ".framework.js.br": "application/javascript",
    ".data.br": "application/octet-stream",
}


def _brotli_content_type(name: str) -> str | None:
    """Return the inner Content-Type for a pre-brotlified Unity asset, or None."""
    for suffix, ctype in _BROTLI_TYPES.items():
        if name.endswith(suffix):
            return ctype
    return None


@router.get("")
async def play_root_no_slash():
    """Redirect /play -> /play/ so relative asset paths in index.html resolve."""
    return RedirectResponse(url="/play/", status_code=307)


@router.get("/")
async def play_index():
    index = GAME_BUILD_DIR / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="Game build not installed")
    return FileResponse(index, media_type="text/html")


@router.get("/{path:path}")
async def play_asset(request: Request, path: str):
    # Resolve and ensure we stay inside GAME_BUILD_DIR
    target = (GAME_BUILD_DIR / path).resolve()
    try:
        target.relative_to(GAME_BUILD_DIR)
    except ValueError:
        raise HTTPException(status_code=404)

    if not target.is_file():
        raise HTTPException(status_code=404)

    brotli_ctype = _brotli_content_type(target.name)
    if brotli_ctype:
        return FileResponse(
            target,
            media_type=brotli_ctype,
            headers={"Content-Encoding": "br"},
        )

    return FileResponse(target)
