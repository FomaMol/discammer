#!/usr/bin/env bash
# Runtime candidate, executed only by systemd after explicit provision approval.
set -euo pipefail
: "${DATA_FS_UUID:?Verified filesystem UUID required}"
: "${DISCAMMER_IMAGE:?Immutable ECR image digest required}"
[[ "$DISCAMMER_IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/discammer-web@sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid immutable image digest' >&2; exit 1; }
mountpoint -q /opt/discammer || { echo 'Persistent mount missing' >&2; exit 1; }
[[ "$(findmnt -n -o UUID --target /opt/discammer)" == "$DATA_FS_UUID" ]] || { echo 'Unexpected persistent filesystem' >&2; exit 1; }
[[ -s /opt/discammer/data/discammer.db ]] || { echo 'Approved restored database missing' >&2; exit 1; }
[[ -d /opt/discammer/media ]] || { echo 'Restored media missing' >&2; exit 1; }
exec docker compose -f /etc/discammer/compose.yaml up --no-build --pull never --abort-on-container-exit
