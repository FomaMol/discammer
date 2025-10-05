# Git LFS — Unity WebGL binaries

Verified locally on 2026-09-10: the retained `web_gl_build_10.*.br` files are
ordinary Git blobs. The new `AntifraudWebBuild.*.br` assets use the existing
`.gitattributes` LFS filter; no history migration is needed or authorized.
The vendor loader and HTML remain ordinary files and must preserve vendor bytes.

Install Git LFS and configure this checkout before staging the new binaries:

```bash
brew install git-lfs
git lfs install --local
git lfs ls-files
```

Do not renormalize the retained assets as part of the import. Commit only the new
LFS pointers; the Git LFS pre-push hook uploads their objects. Verify upload and
remote materialization before treating the deployment path as ready.

CI jobs that verify or package the game need checkout with `lfs: true`, including
backend tests, Docker build, and browser tests. The deployment script currently
runs LFS commands only when `git-lfs` exists. Therefore the production host must
have a working installation before deploying an LFS-backed game; check this
live rather than assuming local installation configures the server.

`backend/game-build-manifest.json` records the exact source archive SHA, the nine
vendor file sizes/hashes, and the previous release. Both tests and Docker build
run `backend/verify_game_build.py`, rejecting pointer stubs, missing/altered
resources, and Windows/debug payloads. This makes a missing production LFS tool
a failed build rather than a silently broken shipped game.

Run the verifier on materialized files:

```bash
python backend/verify_game_build.py
```

The previous Build resources remain available for open sessions and rollback.
Revert the import/cache changes with a new commit and repeat the deployment gate;
do not rewrite shared history or delete old assets during this release.
