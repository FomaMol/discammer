# AWS migration candidate — not provisioned

Prepared alongside final local redesign checks while its production release is blocked
by independently confirmed deployment-target/LFS prerequisites. This package
has never been applied. No AWS account was queried and no paid resource,
credential, DNS record or production data changed.

The coordinator explicitly selected Terraform for this preparation; this is the
only IaC system added. The earlier CloudFormation suggestion is superseded for
this candidate, not silently implemented alongside Terraform.

Read [the migration decision and approval package](../../docs/ops/aws-migration-2026-09.md).

## Local validation already performed

- Official Terraform 1.13.5 downloaded to a temporary directory; its ZIP matched
  the vendor SHA-256 list. AWS provider 6.64.0 was signature-verified during init.
- `terraform init -backend=false -input=false`: local provider initialization.
- `terraform validate`: valid configuration.
- `terraform test`: one mock-provider plan test passed; **not a real AWS plan**.
- `bash -n start-guard.sh`: passed.
- `python3 rehearse-sqlite.py`: synthetic WAL forward backup and reverse latest
  write recovery passed. No production data; no app/cryptography/network claim.

## Required before a real plan

Owner supplies account/region, acceptable budget and RPO/RTO, zone, approved AMI,
backup bucket name, existing alarm topic and current verified Cloudflare CIDRs.
The cost sheet uses Frankfurt only as an illustrative scenario. Configure a
private encrypted state backend and access policy before creating resources;
local state is ignored and must never enter Git. No backend is provisioned here.
Use existing approved short-lived AWS access. No access keys in tfvars.

Then generate a real saved plan, inspect resource actions, IAM/SG diffs, effective
provider version and totals, and obtain explicit approval of that exact plan.
Do not run apply during the preparation step. No automated destroy is provided.

## Boundaries and incomplete activation work

The IaC creates candidate network/EC2/EBS/EIP/IAM/SSM/ECR/private S3 and one EC2
status alarm. It creates **no GitHub OIDC role, DNS record, secrets, bucket
lifecycle deletion, application service activation or data migration**. OIDC and
restricted deployment-document policies require the real account and approved
CI subject; see the concrete CI sequence in the runbook.

`compose.yaml`, `start-guard.sh`, `discammer.service` are runtime candidates.
They deliberately do not format or mount a disk, install packages, generate TLS,
start a public application or pull an unverified image. Install reviewed files
under `/etc/discammer/` only after approval. The main application and current
Beget release workflow do not reference this directory.

Egress allows HTTPS only. Bootstrap must use verified HTTPS package mirrors;
Amazon DNS/time services and SSM connectivity must be tested on the selected
AMI. No inbound SSH/HTTP. TLS must use a reviewed Origin CA/AOP or DNS-based
certificate route. The instance is intentionally not publicly usable before
this is complete. Changing CDN trust or disabling TLS verification is forbidden.

Terraform prevent_destroy guards survive only while the resource configuration
is retained; they are not immutable AWS deletion protection. Data EBS is a
separate resource, root is retained, EC2 termination protection enabled, S3/ECR
force-deletion disabled. Never remove these resources from configuration to
bypass the guards. Any replacement/destruction is a separate owner decision.
