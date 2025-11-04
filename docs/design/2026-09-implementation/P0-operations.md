# P0 operational preflight — 2026-09-10

Read-only observations collected 14:10–14:18 UTC. No hosting, payment, DNS,
secrets, infrastructure, production data or deployment changes were performed.
This is a preflight checkpoint, not a release verification.

## Repository and release

- Git SSH access to `FomaMol/discammer` works; `git ls-remote origin refs/heads/main`
  returned `7167c9d7741e5926faf15752125c8d08cf9201ff`.
- Public `/api/health` returned status/db `ok`, version `8e8036e`, 46 posts,
  20 guides and 18 modules. Read-only SSH verified the serving host checkout at
  `8e8036e07fb4ea278e89bcd6387ef63f5faf8493`. Production is behind main.
- GitHub connector repository permissions include pull/push/admin. CLI `gh` was
  not available; it is not necessary for read-only CI monitoring.
- Latest main [CI run 30673455902](https://github.com/FomaMol/discammer/actions/runs/30673455902)
  is a July 31 run, inspected live today. Audit, backend tests, frontend build,
  Docker build and E2E succeeded in that historical run. They are not today's
  validation of the redesign.
- Deploy job `91296994354`: SSH deploy step succeeded, Health check failed with
  `expected SHA: 7167c9d | domain reports: 8e8036e`; production smoke skipped.
  The log points to a stale `DEPLOY_HOST` target. The secret value was not read.
  Reconcile the target through approved account access before attempting the
  release. Changes to secrets require separate owner confirmation.
- Serving host: Docker 29.5.2; `git lfs version` fails because Git LFS is not
  installed. New game binaries require a verified delivery path, never pointer
  files. Treat this as a release prerequisite.
- Serving host disk: 29 GiB total, 23 GiB used, 5.3 GiB available (82%). No disk
  cleanup was performed. Verify build space before release.

## Hosting continuity

Authenticated Beget UI was inspected read-only. It reports a low-funds warning
and paid-through date **2026-09-11**. The owner was notified immediately. The
site answering HTTP requests does not extend this period. No payment or
subscription change was made. Balance and other private account details are
intentionally omitted from this repository document.

## Recovery evidence

The rescue copy previously reported missing was found in the user's archived
Downloads area under `beget-rescue-2026-09-08`.

- DiScammer ZIP: 767,017 bytes; SHA-256
  `483a5a3501839823b903ff2de8dc7677a23dc2a954bbf4d41a4fd0da813f7469`.
- ZIP CRC test passed for 27 entries. No media entries are present.
- Extracted DB, WAL and SHM were copied together to a disposable local scratch
  directory. SQLite `integrity_check` returned `ok`; `sync_blob` exists with
  zero rows in that dated rescue. The original backup files were not modified.
- This verifies the dated rescue's readability, not a current recovery point or
  a rehearsed production restore. No real sync identifiers/payloads were read.
- Live media directory: about 15 GiB, 34 files. `git ls-files media` on the
  serving release returned zero files; `git status --short` reports untracked
  `media/`. Media are therefore not rescued by Git or the inspected ZIP.
- No application backup directory was found in `/var/backups/discammer`,
  `/opt/backups/discammer` or `/opt/discammer/backups`; no application backup
  timer appeared in `systemctl list-timers`. Cron, off-site storage and other
  possible paths remain unverified. This is not a claim that no backups exist.
- No production media download or new production-data export was performed.

## Continuation

1. Continue all independent redesign and game verification work.
2. Preserve the complete AGENTS.md release gate; historical green checks above
   cannot substitute for new checks or the public SHA assertion.
3. Before deployment, resolve the deployment target and LFS delivery prerequisite
   through the applicable authorization boundaries. Do not silently deploy to an
   old host or bypass CI to hide a failed release.
4. Keep AWS work after the verified redesign release. P6 needs current private
   DB/media inventory, a fresh authorized consistent export, media checksums,
   restore rehearsal, one-writer cutover and reverse data transfer for rollback.
5. Infrastructure/secret/DNS/payment and production-data migration actions remain
   separate approvals. Do not remove Beget or any backup automatically.

## Read-only CI access

Use connected GitHub `github_fetch` with
`https://api.github.com/repos/FomaMol/discammer/actions/runs?branch=main&per_page=3`.
Parse the JSON in `structuredContent.content`, retaining only run ID, SHA,
status, conclusion and URL. Then use `github_fetch_workflow_run_jobs` with the
run ID, and `github_fetch_workflow_job_logs` only for a specific failed job.
The commit-workflow helper filters PR-triggered runs, so it is insufficient for
monitoring deployments triggered by a main push.

## Prepared prerequisite actions — not executed

The deploy workflow passes `secrets.DEPLOY_HOST` to the SSH action. Its remote
script runs on that selected host and fetches/resets that host checkout to
`origin/main`; it does not discover the origin serving the domain. Therefore a
stale target can report a successful SSH deployment while visitors still reach
the old application. Public health SHA verification correctly rejects this.
The live serving host checkout has no tracked source changes, and its healthy
`discammer-web-1` container uses image `discammer-web`.

The concrete preferred repair is to update the existing GitHub production
`DEPLOY_HOST` secret to the independently verified serving host, verify the
existing deploy user/key are valid for it, then rerun the fully gated release.
Do not create a new key or rotate credentials speculatively. A literal host
override in workflow code would also change the deployment destination and is
not a way around the separate approval requirement. Exact host details remain
in the private operator checkpoint, not this document.

The serving host reports Ubuntu 24.04.4 LTS (Noble). Read-only `apt-cache policy
git-lfs` reports no installed package and candidate `3.4.1-1ubuntu0.4` from the
configured Ubuntu update repositories. Prepared host action after separate
approval: refresh package metadata, inspect `apt-get --simulate install
--no-install-recommends git-lfs`, then install that single package with
`apt-get install --no-install-recommends git-lfs`, verify `git lfs version`, and
materialize/verify game LFS objects during the gated release. No full system
upgrade, package removal, firewall or service change is included. Recheck the
candidate after metadata refresh; stop if the transaction adds unexpected
changes. The current deploy script already conditionally calls local LFS setup
and pull, but without the binary these steps silently skip. The game manifest
verification must fail the image build if pointer files remain.
