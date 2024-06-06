# Git LFS — Unity WebGL binaries

The Unity WebGL game build ships three large brotli-compressed binaries that are
tracked with [Git LFS](https://git-lfs.com/) so they don't bloat the Git history.

## What is tracked

`.gitattributes` (repo root) tracks:

```
backend/game_build/Build/*.br filter=lfs diff=lfs merge=lfs -text
```

That glob covers all three binaries the browser loads for `/play/`:

| File | Approx. size |
| --- | --- |
| `backend/game_build/Build/web_gl_build_10.data.br` | ~16 MB |
| `backend/game_build/Build/web_gl_build_10.wasm.br` | ~8.5 MB |
| `backend/game_build/Build/web_gl_build_10.framework.js.br` | ~76 KB |

`web_gl_build_10.loader.js` (~27 KB) is small editable text and is **not** tracked
in LFS — it stays a normal Git object.

## One-time migration (repo owner)

git-lfs must be installed locally first (`brew install git-lfs` on macOS,
`apt-get install git-lfs` on Debian/Ubuntu). Then, from the repo root:

```bash
git lfs install
git lfs migrate import --include="backend/game_build/Build/*.br" --no-rewrite
```

`--no-rewrite` converts only the binaries **in the current commit** into LFS
pointers and records that as a new commit, instead of rewriting the entire branch
history. That keeps every existing commit SHA stable (no force-push of rewritten
history, no broken references), at the cost of the old blobs still living deeper
in history — which is fine here: the goal is to stop *future* growth, and these
binaries entered the repo recently.

After migrating, verify and push:

```bash
git lfs ls-files          # should list the three .br files
git push                  # uploads LFS objects + the pointer commit
```

> The actual `git lfs migrate import` is **deferred to the repo owner** — git-lfs
> is not installed on the machine where this config was authored, so the migration
> has not been run. This document plus `.gitattributes` is the prerequisite setup.

## Production server prerequisite (REQUIRED before next deploy)

**`deploy.sh` does `git reset --hard origin/main` followed by `git lfs pull`.** If
git-lfs is **not** installed on the prod server, the reset checks out LFS *pointer
files* (tiny text stubs) instead of the real binaries, `git lfs pull` fails, the
Docker build copies the stubs into the image, and **`/play/` 404s / the game fails
to load**.

So, **on the prod server, before the first deploy after this change merges:**

```bash
sudo apt-get update && sudo apt-get install -y git-lfs
git lfs install
```

(`deploy.sh` also runs `git lfs install --local` per-run, but the system package
must exist first — `install --local` only configures the existing binary.)

## CI

The `docker-build` job in `.github/workflows/ci-cd.yml` checks out with `lfs: true`
so the real binaries are present in the Docker build context. The `backend-tests`
and `frontend-build` jobs do not need the game binaries and check out without LFS
to stay fast. The `deploy` job has no `actions/checkout` step — it only opens an
SSH session and runs `deploy.sh` on the prod server, where `git lfs pull` does the
materialization.

## Verify

```bash
git lfs ls-files                       # lists the LFS-tracked .br files
git lfs status                         # shows pending LFS changes
file backend/game_build/Build/web_gl_build_10.data.br   # real file, not "ASCII text"
```

A checked-out **pointer file** (the failure mode) is ~130 bytes of `version
https://git-lfs.github.com/spec/v1 ...` text; a **real** binary is multi-MB.
