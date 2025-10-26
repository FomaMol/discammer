# AWS origin migration — reviewable preparation, 10 September 2026

**Status: local candidate only; not provisioned, not migrated, not production verified.**
Prepared while local redesign verification proceeds and external release
prerequisites remain blocked. Production migration remains after the redesign release. No AWS
account access, resource creation, DNS, payment, secret or production-data
transfer occurred. No live Terraform plan exists.

## Decision and missing inputs

Keep the existing Cloudflare edge, same public origin and all URLs. Move only
the origin to one EC2 with nginx, one Docker Compose web service and separate
encrypted gp3 EBS holding SQLite and media. No load balancer, NAT, RDS, ECS,
Redis, Kubernetes or second CDN. This is a single-zone system, not high availability.
Terraform was explicitly selected for this preparation; no parallel CloudFormation
stack is introduced. Candidate source: [deploy/aws](../../deploy/aws/README.md).

Owner confirmation is still required for: actual account/access, region and data
location, monthly budget, traffic expectations, maintenance window, RPO/RTO,
keeping Cloudflare, backup retention and alert recipient/channel. Proposals for
review: hourly backup (RPO target at most one hour), RTO target 30 minutes,
48–72 hours observation and at least seven days retaining Beget. These are
unproven targets and create a temporary double-hosting cost.

## Current facts

Read-only P0 found public health and serving checkout at `8e8036e`, behind
repository main. The prior main pipeline successfully checked code but deployed
to a different target; public SHA check rejected it. Serving host lacks Git LFS.
These release prerequisites must be resolved, not bypassed by migration.

The serving media directory has 34 files, approximately 15 GiB; zero are tracked
in its Git checkout. The archived September 8 rescue has readable DB+WAL and an
empty `sync_blob` table but no media. That dated copy is not a current recovery
point. No current media manifest/off-site recovery proof exists. Beget paid-through
September 11 was confirmed live; owner notified. Private account details are not
included here. See [P0 evidence](../design/2026-09-implementation/P0-operations.md).

## Concrete proposed resource change

`deploy/aws/*.tf` declares one VPC/subnet/Internet gateway/route table; a security
group accepting only HTTPS from explicit verified Cloudflare IPv4 ranges; one
x86_64 Ubuntu EC2; one Elastic IP; 24 GiB encrypted retained root; 40 GiB separate
encrypted retained data gp3; instance role/profile with SSM, scoped ECR pull and
S3 object put/get; immutable private ECR repository; private versioned encrypted
S3 backup bucket; one EC2 status alarm to an existing owner-approved SNS topic.
No inbound SSH, application port or metrics. HTTPS-only outbound, IMDSv2 and
hop limit 1. No AWS credentials available inside the application container.

The 40 GiB data proposal allows the observed 15 GiB media plus backup copies,
release metadata and headroom; validate exact bytes and retention before approval.
Root stores images/OS, not user data. Instance replacement and volume destruction
are blocked by Terraform lifecycle guards; EC2 termination protection is also on.
These guards must not be removed to bypass review. S3 lifecycle deletion is absent
until retention is approved; storage can consequently grow.

T3 uses **standard** credit mode: it can throttle when credits run out; it does not
silently incur Unlimited surplus-credit charges. Capacity remains unmeasured;
load rehearsal must determine whether t3.small (2 GiB) is suitable. Raising to
another type requires a revised cost and approval. CPU credits are not equivalent
to sustained two-core capacity.

## Dated illustrative cost, USD/month

**Frankfurt (`eu-central-1`) is an assumption for comparison, not the chosen
region.** 730 hours; Linux on-demand t3.small; no discounts/credits/free-tier
allowance assumed. Excludes taxes, Beget overlap and paid alert delivery.

| Component | Assumed quantity and rate | Monthly USD |
|---|---|---:|
| EC2 | 730 h × $0.024 | 17.52 |
| Encrypted gp3 root + data | 64 GB × $0.0952 | 6.09 |
| One public IPv4 | 730 h × $0.005 | 3.65 |
| Snapshot storage allowance | 20 GB × $0.054 | 1.08 |
| S3 Standard backup storage | 20 GB × $0.0245 | 0.49 |
| S3 requests | 1,000 PUT/LIST + 1,000 GET | 0.006 |
| ECR private storage | 2 GB × $0.10 | 0.20 |
| CloudWatch logs | 2 GB ingest × $0.63 + 2 GB stored × $0.0324 | 1.32 |
| Standard alarms allowance | 6 × $0.10 | 0.60 |
| Additional custom metrics allowance | Provisional budget allowance, not verified usage | 3.00 |
| **Illustrative baseline** | Before internet egress | **34.06** |

Snapshot scheduling, log/agent configuration and five additional alarms are
activation work, not resources already running. The cost table budgets them to
avoid understating eventual production cost. A final Calculator estimate and
actual account billability must replace this worksheet before provision.

Internet egress from EC2 **to external Cloudflare counts**, even with a CDN.
Use measured origin bytes (cache misses), not pageview count. At $0.09/GB,
100/500/1,000 GB per month add $9/$45/$90: illustrative totals **$43.06 /
$79.06 / $124.06**. AWS offers a shared 100 GB monthly internet-transfer allowance,
but it may already be consumed by other workloads, so it is not subtracted here.
Video viewing can dominate cost. No promised hard spend cap: budget alerts only
notify. Agree a limit and an operational response before provisioning.

Official sources, fetched September 10:
[Frankfurt EC2/EBS price feed](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/eu-central-1/index.json)
(publication September 9, effective September 1),
[Frankfurt S3 feed](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/eu-central-1/index.json),
[Frankfurt CloudWatch feed](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/eu-central-1/index.json),
[Frankfurt transfer feed](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/eu-central-1/index.json),
[IPv4 pricing](https://aws.amazon.com/vpc/pricing/),
[ECR pricing](https://aws.amazon.com/ecr/pricing/).
Selected public rate evidence: [price-evidence.json](../../deploy/aws/price-evidence.json).
The attempted ECR regional feed returned 404; its storage rate uses the official
ECR pricing page instead. Save the finalized estimate in [AWS Pricing Calculator](https://calculator.aws/)
after the owner chooses the missing inputs.

## Exact activation sequence before any cutover

1. Complete redesign release on the approved existing target, including public
   SHA, smoke and actual Unity menu/scenario. Freeze its SHA and game manifest.
2. Obtain confirmed account/region/budget/RPO/RTO, verify read-only identity and
   quotas, inventory existing networking/SSM/OIDC/SNS/state backend. Do not create
   duplicates merely because account inventory was unavailable during preparation.
3. Supply all required Terraform inputs, pin reviewed AMI and fresh CDN CIDRs,
   configure private encrypted remote state and lock. Generate an actual saved
   plan, inspect resources/cost/policies, obtain **approval A: exact provision**.
   Local mock-plan success is insufficient. Do not apply before approval.
4. Provision only approved resources. Prepare Ubuntu using HTTPS package mirrors;
   install Docker/Compose, nginx, sqlite3, AWS CLI/SSM and needed monitoring.
   Verify EIP routing, SSM and constrained egress before proceeding. No inbound 22.
5. Identify the new EBS by volume ID, confirm it is new/blank before any format,
   mount by filesystem UUID at `/opt/discammer`; install fstab and systemd guard.
   Keep runtime config in `/etc/discammer`; fail if volume/UUID/DB/media is absent.
   `start-guard.sh` and standalone `compose.yaml` are prepared but not activated.
   Docker restart is disabled in Compose so systemd's verified mount gate controls
   restarts. Test missing mount and reboot before introducing production data.
6. Reconcile live nginx configuration privately (do not dump secrets to artifacts).
   Preserve `/media/` alias and Range/206, `/play/` routing/Brotli, headers and
   timeouts. Use verified Cloudflare real-IP ranges; trust nginx/Docker gateway
   only. Preserve Report-Only CSP. Install approved TLS credentials via protected
   channel: Origin CA/AOP or DNS-challenge issuance is a separate secret/DNS action.
   The candidate accepts only port 443, so HTTP ACME cannot silently work.
7. Prepare immutable image CI: all existing audit/backend/frontend/Docker/E2E
   gates remain; build Linux image once with accepted GIT_SHA, push unique SHA
   to private ECR, retain resulting digest. AWS runtime pulls that digest, never
   builds from mutable main. Keep current Beget deploy unchanged until cutover.
8. OIDC/IAM preparation: owner-approved account must supply existing or separately
   approved GitHub OIDC provider. Restrict audience to `sts.amazonaws.com`, subject
   to exact `repo:FomaMol/discammer:ref:refs/heads/main` for a branch-scoped job.
   If production environment is used instead, subject changes to
   `repo:FomaMol/discammer:environment:production`; verify environment branch
   protection is actually enforceable before using it. Do not issue a broad
   environment trust without that gate. Use separate ECR-push and deploy roles.
   Deploy role gets only approved instance + fixed SSM deploy-document access,
   never arbitrary shell/IAM/DNS/create-resource rights. No long-lived access keys.
   These policies/workflow are not yet activated or claimed account-validated.
9. Install fixed root-owned deployment document/script accepting only a validated
   ECR digest and expected SHA. Save previous digest; pull; restart through the
   mount guard; health+SHA probe; image rollback to previous digest if unhealthy.
   Do not restore DB as an automatic response to failed smoke. Before real usage,
   test this chain in isolated staging and review its IAM/input boundaries.
10. Configure hourly remote backup with explicit nonempty S3 destination and
    instance role; clear R2 endpoint override. Missing remote/upload/age must fail
    the gate, even though existing backup-db.sh permits local-only success.
    Download explicit remote object for restore test (existing `latest` prefers
    local copies and does not prove off-site recovery). Approve lifecycle retention
    separately. Add backup-age/failure, disk/inodes, memory, 5xx, TLS expiry,
    external public health+SHA and budget alarms; configure finite log retention.
    Logs must omit query/body/headers/checker text/URL/sync identifiers.

## Data preparation and rehearsal gates

Production-data export/migration requires **approval B: exact source, destination,
protection and scope**. Before that, only read-only inventory or wholly synthetic
local tests are allowed. Keep any production copy private, never in Git/CI artifacts.

After approval: obtain a WAL-consistent SQLite online backup, integrity/checksum,
UTC timestamp and private sync aggregates. Enumerate all media relative paths,
bytes and SHA-256. Copy media with resume and no delete, then verify every file.
Preserve `/media/` and the same site origin. Test representative actual media
URLs and range responses. Pre-copy large media before maintenance.

Restore a downloaded remote backup onto isolated scratch storage, verify tables
and `sync_blob` aggregates before and after startup/reseed/TTL sweep. Explain any
TTL deletion; do not infer an empty table means no state was lost. Test a synthetic
**real encrypted application canary**, restart, reseed, backup, restore and decrypt
with test client, without recording its code/payload. Test image rollback and
reverse latest-state transfer to old host. Measure RTO and restore age; the local
SQLite proof below is not this staging gate.

All RU/EN routes and both themes, JS/no-JS, privacy, course progress/sync,
keyboard/mobile, same game hashes and actual gameplay must pass on new origin.
Verify HTTPS using a legitimate trust path, never disabled certificate checks.
Load-test isolated staging and validate T3 credits, RAM, SQLite lock/latency and
media egress. Get **approval C: exact routing diff and maintenance window** only
after these gates are green.

## Cutover: exactly one writer

1. Both origins have the same accepted SHA/game bytes; verify old host/payment,
   TLS, final backups, media parity and rollback availability. Freeze deployments.
   Record current A/AAAA/routing rules; do not change nameservers. Proxied DNS
   TTL does not govern Cloudflare's origin routing. Remove/replace obsolete AAAA
   only as explicitly approved in the final routing diff.
2. Activate maintenance at both origins, `503`, `Retry-After`, `Cache-Control:
   no-store`. **Block every `/api/sync/` route, including pull and delete**:
   pull changes `last_seen_at`. Drain requests and stop old web. Old must remain
   blocked even for stale clients. Never redirect POST sync between hosts.
3. Take final consistent old-host backup after writer stop; verify integrity,
   checksum and private aggregates. Preserve it without overwrite. Copy final
   DB plus media delta to new EBS and compare manifests.
4. Start AWS with public sync still blocked. Verify mounts, DB aggregates before
   and after startup, SHA, game and media. If anything fails, restore old service
   before routing changes; no new AWS user write has been accepted.
5. Apply only approved routing change; verify public domain SHA/HTTPS/RU/EN/game,
   media ranges, no stale HTML/new-assets mismatch. Old remains maintenance.
6. Open sync **only on AWS** after public acceptance. Record time of first allowed
   write. New AWS DB is now authoritative; old backup cannot be restored as current.
   Change CI target under approved scope and prevent concurrent Beget deployment.
7. Observe 48–72 hours if agreed; download first scheduled off-site backup and
   restore to scratch. Keep old host/data through the agreed rollback window.

## Rollback preserving writes

Before AWS accepts sync writes: route back and restart old exact release/DB,
verify public SHA and smoke. After any AWS write: maintenance/block all sync on
**both** origins, drain and stop AWS; make a fresh verified backup of latest AWS
DB; transfer that DB back to Beget, verify schema/app compatibility and aggregates;
then start old service, route back and open only that writer. Do not merge opaque
blobs or SQLite files. If latest AWS DB cannot be recovered, report exact potential
loss and require owner's recovery decision; never claim zero-loss rollback to a
stale copy. An image-only rollback on AWS uses the same persistent DB and does
not revert DNS/data. Never automatically delete Beget, media, backups or keys.

## Verification performed and outstanding

Local: Terraform 1.13.5 official archive checksum verified; signed provider 6.64.0
initialized; `fmt`, `validate` green; one mock-provider plan safety test green;
shell syntax green; synthetic WAL forward/reverse latest-write proof green
(about 0.02 s, one row, no production data). `rehearse-sqlite.py` tests only SQLite
backup mechanics with synthetic opaque bytes and a reduced schema: it does not
prove app encryption, real schema/reseed, remote backup, mounts, recovery time or
single-writer network enforcement. Application tests in the redesign gate remain
separate evidence.

Outstanding: owner inputs, real plan/backend/quota/IAM review, full bootstrap and
fixed SSM deploy implementation, actual CI/OIDC trust, nginx/TLS reconciliation,
monitoring/retention setup, approved export/media manifest, remote restore/app
canary/reboot/load rehearsal, exact routing change, provision/cutover approvals,
production checks and first scheduled remote backup restore. This package is
concrete preparation, not a completed AWS migration or permission to apply it.
