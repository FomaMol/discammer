"""Delivery contracts for the exact supplied Unity build and retained release."""
import asyncio
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from routers.game import GAME_BUILD_DIR, _cache_control_for, play_asset
from verify_game_build import verify_game_build


@pytest.mark.parametrize("path", ["/play/", "/play/index.html", "/play/Build/AntifraudWebBuild.loader.js"])
def test_head_matches_get(client, path):
    head, get = client.head(path), client.get(path)
    assert head.status_code == get.status_code == 200
    assert head.content == b""
    for header in ("content-type", "content-length", "etag", "last-modified", "cache-control"):
        assert head.headers[header] == get.headers[header]
    assert head.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("suffix,ctype", [("data.br", "application/octet-stream"), ("framework.js.br", "application/javascript"), ("wasm.br", "application/wasm"), ("loader.js", "text/javascript")])
def test_build_headers(client, suffix, ctype):
    for name, cache in [("AntifraudWebBuild", "no-cache"), ("web_gl_build_10", "public, max-age=31536000, immutable")]:
        response = client.head(f"/play/Build/{name}.{suffix}")
        assert response.status_code == 200
        assert response.content == b""
        assert response.headers["cache-control"] == cache
        # Python MIME databases can label .js as either historical JS MIME type.
        if suffix == "loader.js":
            assert response.headers["content-type"].split(";")[0] in {"text/javascript", "application/javascript"}
        else:
            assert response.headers["content-type"] == ctype
            assert response.headers["content-encoding"] == "br"


def test_exact_vendor_files_and_retained_release():
    verify_game_build()
    html = (GAME_BUILD_DIR / "index.html").read_text()
    resources = re.findall(r'(?:src=|(?:dataUrl|frameworkUrl|codeUrl):\s*)"([^"]+)"', html)
    assert len(resources) == 4
    assert all((GAME_BUILD_DIR / path).is_file() for path in resources)


def test_unknown_build_names_are_not_immutable():
    assert _cache_control_for(Path("Build/future_99.data.br")) == "no-cache"


@pytest.mark.parametrize("path", ["/play/Build/missing.loader.js", "/play/%2e%2e/config.py", "/play/Build/%2e%2e/%2e%2e/config.py"])
def test_missing_or_escaped_paths(client, path):
    assert client.get(path).status_code == 404


def test_resolved_path_cannot_escape():
    with pytest.raises(HTTPException) as error:
        asyncio.run(play_asset("../config.py"))
    assert error.value.status_code == 404
