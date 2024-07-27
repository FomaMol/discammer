# Dependency auditing — supply-chain policy

CI audits every dependency on every push and PR so a *known-vulnerable*
dependency fails the pipeline, not production. The check is the `audit` job in
[`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml).

## What runs

The `audit` job has **no `needs:`** — it runs in parallel with the test/build
jobs so vulnerability feedback is fast and independent of the test matrix. It
covers both ecosystems in one job:

| Step | Tool | Scope | Threshold | Blocking? |
| --- | --- | --- | --- | --- |
| Python dependency audit | `pip-audit==2.10.1` | `requirements.txt` + `requirements-dev.txt` | any known vuln | **yes** |
| Python audit report | `pip-audit ... --desc` | same | informational | no (`\|\| true`) |
| npm audit | `npm run audit` → `npm audit --omit=dev --audit-level=high` | frontend **prod** deps only | high / critical | **yes** |
| npm audit report | `npm audit --omit=dev --audit-level=moderate` | frontend prod deps | moderate+ | no (`\|\| true`) |

Both blocking steps are paired with an `if: always()` informational step that
re-runs the same scan at a lower threshold. Moderates (and below) therefore show
up in the job logs for triage but never turn CI red.

### Why these thresholds

- **Python — block on *any* vuln.** `pip-audit` doesn't filter by severity on
  the CLI, and our Python surface is small and all server-side (it renders and
  sanitizes untrusted markdown via `bleach`). Treating every advisory as
  blocking is the safe default; the escape hatch for an un-fixable advisory is a
  justified `--ignore-vuln` (below), not a severity gate.
- **npm — block on high/critical, `--omit=dev`.** Only `dependencies` ship in
  the browser bundle; `devDependencies` (vite, vitest, tsc, tailwind) are build
  tooling that never reaches a user, so `--omit=dev` keeps the gate focused on
  what actually deploys. **Moderate is reported, not blocked** — npm's moderate
  advisories are frequently dev-server / tooling noise, and blocking on them
  would make the gate flap without improving the shipped artifact.

### Why the audit tool is pinned

`pip install pip-audit==2.10.1` — an unpinned auditor is its own supply-chain
hole, and a silent tool bump could flip CI red or green with no code change.
The pin moves under the same deliberate-bump discipline as the app's own deps
(see `requirements.txt`: exact `==` pins, never ranges). `npm audit` ships with
the pinned Node toolchain, so it inherits its version from `setup-node`.

### Relationship to `deploy`

The `audit` job is intentionally **not** in the `deploy` job's `needs:` list.
`deploy` already gates on `backend-tests`, `frontend-build`, `docker-build`, and
`e2e`. The audit gate is enforced at the **pull-request / branch-protection**
level (a red `audit` check blocks the merge), which keeps a known-vuln
dependency out of `main` in the first place — rather than only catching it on
the post-merge push-to-deploy run. Keep branch protection requiring the
`Dependency audit (supply chain)` check.

## How to triage a finding

When the `audit` job goes red:

1. **Read which package + advisory.** `pip-audit` prints the package, installed
   version, advisory ID (e.g. `GHSA-…` / `PYSEC-…`), and **Fix Versions**.
   `npm audit` prints the same plus a dependency path.
2. **Confirm whether we actually exercise the vulnerable code path.** Grep the
   backend/frontend for the affected API. Example: the `bleach` `clean()` XSS
   advisories below were real for us because `backend/markdown_renderer.py`
   calls `bleach.clean()`; a `linkify(parse_email=True)` advisory would *not*
   apply because we never call `linkify`. This determines urgency, not whether
   you fix it — you still fix or ignore-with-justification.
3. **If a fix version exists → bump the pin** to the nearest safe version.
   **Do not widen a pin to a range** (`>=`) to dodge an advisory — that
   reintroduces the exact drift the exact-pin policy (`requirements.txt` header)
   exists to prevent. Bump `==`, re-run the gates, commit.
4. **If no fix version exists → add a justified, time-boxed ignore** (below).
5. **Re-run the local gates after any bump:**

   ```bash
   # from repo root — Python
   backend/.venv/bin/pip install -r requirements-dev.txt   # pick up the bump
   backend/.venv/bin/python -m pytest -q                   # must stay green (≥73)
   backend/.venv/bin/pip-audit -r requirements.txt -r requirements-dev.txt

   # frontend
   cd frontend && npx tsc --noEmit && npm run audit
   ```

   (The committed `backend/static/` artifact is rebuilt by the `frontend-build`
   job's drift check — don't hand-run `npm run build` as part of an audit bump.)

## How to add a justified, time-boxed ignore

Only when an advisory has **no fix version** and we've confirmed either that the
vulnerable code path is unreachable for us, or that the residual risk is
accepted by the maintainer. Add the advisory ID to the **blocking** pip-audit
step and annotate it:

```yaml
- name: Python dependency audit (blocking — fails on any known vuln)
  run: >
    pip-audit -r requirements.txt -r requirements-dev.txt
    --ignore-vuln GHSA-xxxx-xxxx-xxxx   # <pkg>: no fix; we don't call <api>.
                                        # Re-evaluate by YYYY-MM-DD (owner: …).
```

Rules for an ignore entry:

- **Justify it inline** — package, why it's safe (unreachable path / accepted
  risk), and a **re-evaluation date** so the ignore is time-boxed, not
  permanent.
- **Drop it the moment a fix ships.** When `--desc`'s informational report shows
  a Fix Version, remove the `--ignore-vuln` and bump the pin instead.
- For npm, the equivalent is an [`overrides`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides)
  entry or `audit-level` adjustment — prefer bumping the transitive dep; an
  ignore there must carry the same inline justification + date.

## Current state of the tree (verified 2026-06-19)

The `audit` job is **green** on the current tree, after one justified bump:

- **`bleach` 6.3.0 → 6.4.0.** `pip-audit` flagged three advisories against
  6.3.0; two of them (`GHSA-gj48-438w-jh9v` — `formaction` URI-scheme bypass,
  and `GHSA-8rfp-98v4-mmr6` — an `a`/`href` `clean()` XSS bypass) are **directly
  relevant**: `backend/markdown_renderer.py` sanitizes rendered markdown through
  `bleach.clean()` with `a`/`href` allowed. Both are fixed in **6.4.0**. The
  third (`GHSA-g75f-g53v-794x`, a `linkify(parse_email=True)` ReDoS) doesn't
  apply to us (we never call `linkify`) and also no longer appears against
  6.4.0. After the bump:
  - `pip-audit -r requirements.txt -r requirements-dev.txt` → **No known
    vulnerabilities found** (exit 0). No `--ignore-vuln` entries are needed.
  - `backend/.venv/bin/python -m pytest -q` → **73 passed**.
- **Frontend:** `npm audit --omit=dev --audit-level=high` → **found 0
  vulnerabilities** (exit 0).
