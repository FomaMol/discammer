# DiScammer — SQLite off-site backups (REL-1)

Operational runbook for the automated, off-site, WAL-consistent backups of the
production SQLite database.

- **Scripts**: [`scripts/backup-db.sh`](../../scripts/backup-db.sh),
  [`scripts/restore-db.sh`](../../scripts/restore-db.sh)
- **Prod host**: `203.0.113.11` (2 vCPU / 2 GB / no swap), repo root
  `/opt/discammer`
- **Live DB**: `/opt/discammer/data/discammer.db` (bind-mounted into the
  container at `/app/data`, **WAL mode** → `-wal`/`-shm` sidecars)
- **Off-site target**: Cloudflare R2 (free 10 GB tier, **no egress fees**)

---

## Why & what we protect

The content tables (`post`, `scam_guide`, `course_module`) are **wiped and
reseeded from git on every startup**, so they are disposable.

**`sync_blob` is not.** UX-4 added the project's first durable *user* table, so
the sentence this section used to carry — "any future writable table would be
irreplaceable" — is no longer about the future. It is here now:

- `sync_blob` holds opt-in, client-encrypted course progress keyed by `blob_id`.
- It is deliberately excluded from `seed_database()`'s DELETE list and from
  `init_db()`'s column-drift DROP loop, and
  `backend/tests/test_db_lifecycle.py` pins both exclusions.
- **Losing the DB file now loses user data**, and the loss is permanent: only
  the learner holds the key, so we cannot reconstruct a blob from anything we
  have, and we have no email with which to tell anyone it happened.
- `backup-db.sh` snapshots the **whole file**, so `sync_blob` is covered without
  any change to REL-1. That is worth stating explicitly rather than leaving it
  to be inferred at 03:00: the table needs no special handling, but it does need
  the restore to actually be run instead of the box being written off as
  self-healing content.

Backups were cheap insurance before UX-4. They are load-bearing now.

`backup-db.sh` uses SQLite's **online backup API** (`.backup`), which is the
only correct way to snapshot a live WAL database — a naked `cp` of the `.db`
can capture a torn, un-checkpointed state. The snapshot is verified with
`PRAGMA integrity_check` **before** it is compressed and uploaded, so a bad
backup never replaces a good one.

### RPO / RTO

Before UX-4 these were bookkeeping — the only thing to lose was content that git
could re-emit. Since `sync_blob`, the RPO is a real quantity of real user data.

- **RPO (Recovery Point Objective) ≈ 24 h** — daily cron, so at most ~1 day of
  writes is lost in a worst-case disk failure. Concretely: a learner who linked
  a device or finished a module since the last snapshot loses that, silently, and
  we have no way to tell them. Tighten by running the cron more often if/when
  user-write volume justifies it.
- **RTO (Recovery Time Objective) ≈ minutes** — restore is: pull latest →
  verify → stop container → swap file → start. The DB is tiny (single-digit
  MB), so the wall-clock cost is dominated by the container restart.

---

## One-time setup

### 1. Install dependencies on the host

```bash
# rclone (preferred uploader) + sqlite3 client (for .backup) + gzip
sudo apt-get update
sudo apt-get install -y sqlite3 gzip
# rclone — official install script (gets a current version, distro pkgs lag):
curl https://rclone.org/install.sh | sudo bash
rclone version
```

> `aws s3 cp` is supported as an alternative uploader (R2 speaks the S3 API).
> Install `awscli` instead of rclone only if you prefer it; rclone is the
> documented path below.

### 2. Create the R2 bucket + API token (Cloudflare dashboard)

1. **R2 → Create bucket** → name it `discammer-backups`. Pick a region close to
   the VPS (or "Automatic").
2. **R2 → Manage R2 API Tokens → Create API token**:
   - Permission: **Object Read & Write**, scoped to the `discammer-backups`
     bucket (least privilege — this token can only touch backups).
   - Copy the **Access Key ID** and **Secret Access Key** (shown once).
3. Note your **Account ID** (R2 overview page). The S3-compatible endpoint is:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

### 3. Configure the rclone remote

Run `rclone config` and create a remote of type **`s3`** with provider
**`Cloudflare`**:

```text
n) New remote
name> r2
Storage> s3
provider> Cloudflare
env_auth> false
access_key_id>     <R2 Access Key ID>
secret_access_key> <R2 Secret Access Key>
region>            auto
endpoint>          https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

This writes `~/.config/rclone/rclone.conf`. Verify:

```bash
rclone lsd r2:                       # should list the discammer-backups bucket
rclone lsf r2:discammer-backups      # empty until the first backup runs
```

The matching `BACKUP_REMOTE` value is then:

```
BACKUP_REMOTE=rclone:r2:discammer-backups
```

> **aws-cli alternative**: instead of the rclone remote, export
> `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
> `AWS_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
> `AWS_DEFAULT_REGION=auto`, and set
> `BACKUP_REMOTE=s3://discammer-backups`. The script auto-detects the `s3://`
> prefix and uses `aws s3 cp`.

### 4. Remote retention — R2 lifecycle rule (30 days)

Local retention (14 days) is handled by the script. **Remote** retention lives
in the bucket so it survives a dead host. In the Cloudflare dashboard:

**R2 → `discammer-backups` → Settings → Object lifecycle rules → Add rule**

- Apply to: **all objects** (or prefix-scoped if you later store more in the
  bucket).
- Action: **Delete objects** *N* days after creation → set **30 days**.

This keeps ~30 daily backups off-site at trivial cost while preventing unbounded
growth. (Local keeps 14; off-site keeps 30 — off-site is the more durable copy,
so it gets the longer window.)

---

## Daily cron (host)

Backups run as a host cron job (not inside the container — the host has the
`sqlite3`/`rclone` binaries and the rclone config). Run at **03:30** local time:

```cron
# /etc/cron.d/discammer-backup  (or `crontab -e` for the deploy user)
# m  h  dom mon dow  user  command
30 3   *   *   *    root  BACKUP_REMOTE=rclone:r2:discammer-backups /opt/discammer/scripts/backup-db.sh >> /var/log/discammer-backup.log 2>&1
```

Notes:

- Set `BACKUP_REMOTE` inline (cron has a minimal env). If you used the aws-cli
  path, also export the `AWS_*` vars in the cron line or an `EnvironmentFile`.
- The script defaults to `DB=/opt/discammer/data/discammer.db`,
  `BACKUP_DIR=/opt/discammer/backups`, `RETENTION_DAYS=14` — override via the
  same `KEY=value command` syntax if needed.
- Output is appended to `/var/log/discammer-backup.log`; the final
  `[backup-db] DONE: ...` line is greppable for monitoring. The script exits
  **non-zero** on a real failure (missing DB, failed integrity check, failed
  upload to a configured remote), so `cron` mail / a log-watch alert will fire.

Verify after the first run:

```bash
ls -lh /opt/discammer/backups/        # local copy present
rclone lsf r2:discammer-backups       # off-site copy present
```

---

## Restore procedure

Use [`scripts/restore-db.sh`](../../scripts/restore-db.sh). It is **dry-run by
default** and requires `--yes` to overwrite the live DB. It always verifies the
candidate with `integrity_check` first and takes a `.pre-restore.<ts>` safety
copy of the current DB before swapping.

### Step by step

1. **Preview** what would happen (no changes made):

   ```bash
   cd /opt/discammer
   # newest local backup, or pull newest from R2 if no local copy exists:
   BACKUP_REMOTE=rclone:r2:discammer-backups scripts/restore-db.sh latest
   # ...or a specific file:
   scripts/restore-db.sh /opt/discammer/backups/discammer-20260623-033000.db.gz
   ```

   Read the printed plan. Confirm the source file and live-DB path are right.

2. **Apply** the restore (stops the container, swaps the DB, restarts):

   ```bash
   BACKUP_REMOTE=rclone:r2:discammer-backups scripts/restore-db.sh latest --yes
   ```

   The script: `compose stop web` → safety-copy current DB →
   swap in verified candidate → delete stale `-wal`/`-shm` →
   `compose up -d web`.

3. **Verify** the site came back healthy:

   ```bash
   curl -fsS http://127.0.0.1:8000/api/health
   ```

4. Once satisfied, delete the safety copy
   (`/opt/discammer/data/discammer.db.pre-restore.<ts>`). Keep it until you are
   sure — it is your undo for a wrong-backup restore.

> If a restore goes wrong, the live DB before the swap is preserved as
> `discammer.db.pre-restore.<ts>`. Stop the container, copy that file back over
> `discammer.db`, remove `-wal`/`-shm`, and restart.

---

## Monthly restore test (do not skip)

A backup you have never restored is a hypothesis, not a backup. **Once a month**,
prove recoverability against a throwaway DB path (never the live one):

```bash
cd /opt/discammer
# Restore the latest backup into a scratch file and integrity-check it.
TMP=/tmp/restore-test.db
gzip -dc "$(ls -1t backups/discammer-*.db.gz | head -1)" > "$TMP"
sqlite3 "$TMP" "PRAGMA integrity_check;"   # expect: ok
sqlite3 "$TMP" ".tables"                   # expect: post, scam_guide, course_module (+ any user tables)
rm -f "$TMP"
```

For a fuller drill, run `restore-db.sh latest` (dry run) and read the plan, or
restore into a staging compose stack with `DB=/path/to/staging.db ... --yes`.
Record the date of the last successful test (e.g. in the incident runbook).

---

## GitHub secrets / env

Backups run on the **host**, not in CI, so the credentials live on the host
(rclone config or `AWS_*` env), **not** in GitHub. Nothing new is required in
GitHub Actions for the daily backup itself.

If you later wire a backup/restore step into a workflow (e.g. a pre-deploy
backup or a scheduled restore-test job), add these repo **Secrets**:

| Secret | Value | Used by |
| --- | --- | --- |
| `R2_ACCESS_KEY_ID` | R2 API token Access Key ID | rclone / aws |
| `R2_SECRET_ACCESS_KEY` | R2 API token Secret Access Key | rclone / aws |
| `R2_ACCOUNT_ID` | Cloudflare account id (for the endpoint URL) | endpoint |
| `BACKUP_REMOTE` | `rclone:r2:discammer-backups` or `s3://discammer-backups` | both scripts |

For the `aws s3 cp` path also export
`AWS_ENDPOINT_URL=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` and
`AWS_DEFAULT_REGION=auto` in the job env.

---

## Quick reference

```bash
# Manual one-off backup (off-site):
BACKUP_REMOTE=rclone:r2:discammer-backups /opt/discammer/scripts/backup-db.sh

# Local-only backup (no remote configured → warns, exits 0):
/opt/discammer/scripts/backup-db.sh

# Preview a restore (dry run):
scripts/restore-db.sh latest

# Apply a restore:
BACKUP_REMOTE=rclone:r2:discammer-backups scripts/restore-db.sh latest --yes
```

| Knob | Default | Meaning |
| --- | --- | --- |
| `DB` | `/opt/discammer/data/discammer.db` | live SQLite file |
| `BACKUP_DIR` | `/opt/discammer/backups` | local backup store + prune scope |
| `BACKUP_REMOTE` | *(unset)* | `rclone:…` / `r2:…` / `s3://…`; unset = local-only |
| `RETENTION_DAYS` | `14` | prune local `*.db.gz` older than this |
| `COMPOSE` *(restore)* | `docker compose -f docker-compose.yml -f docker-compose.prod.yml` | stop/start command |
| `SERVICE` *(restore)* | `web` | compose service name |
