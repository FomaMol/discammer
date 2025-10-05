"""Verify the exact vendor delivery, also executed inside the Docker build."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path


def verify_game_build(base: Path | None = None) -> None:
    base = base or Path(__file__).resolve().parent
    manifest = json.loads((base / "game-build-manifest.json").read_text())
    root = base / "game_build"
    retained = {
        name: spec for name, spec in manifest["previous_files"].items()
        if name.startswith("Build/")
    }
    for name, spec in {**retained, **manifest["files"]}.items():
        data = (root / name).read_bytes()
        assert not data.startswith(b"version https://git-lfs.github.com/spec/v1"), name
        assert len(data) == spec["size"], f"Wrong size: {name}"
        assert sha256(data).hexdigest() == spec["sha256"], f"Wrong SHA256: {name}"
    forbidden = [p for p in root.rglob("*") if p.suffix.lower() in {".exe", ".dll"} or "DoNotShip" in str(p)]
    assert not forbidden, forbidden


if __name__ == "__main__":
    verify_game_build()
    print("Game vendor manifest and retained release verified")
