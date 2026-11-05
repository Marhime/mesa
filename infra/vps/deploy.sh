#!/usr/bin/env bash
# Pushes this repository to the VPS and rebuilds the worker (the repo is not cloned there).
#   MESA_VPS=root@1.2.3.4 infra/vps/deploy.sh
# The server keeps its own infra/vps/.env, backups and secrets: they are never overwritten.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${MESA_VPS:?set MESA_VPS=user@host}"
DEST="${MESA_DIR:-/opt/mesa}"

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .expo --exclude .DS_Store \
  --exclude 'apps/mobile/ios' --exclude 'apps/mobile/android' \
  --exclude '.env' --exclude '.env.local' \
  --exclude 'infra/vps/backups' --exclude 'infra/vps/secrets' \
  ./ "$MESA_VPS:$DEST/"

ssh "$MESA_VPS" "cd $DEST/infra/vps && docker compose up -d --build worker && sleep 8 && docker compose logs --tail 5 worker"
