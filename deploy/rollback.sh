#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
[[ -f .deploy/previous.env && -f .deploy/previous-compose.yaml ]] || { echo 'No previous successful release' >&2; exit 1; }
exec 9>.deploy/lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
cp .deploy/current.env .deploy/rollback-current.env
cp .deploy/current-compose.yaml .deploy/rollback-current-compose.yaml
if env -u KUNI_IMAGE -u KUNI_NETWORK docker compose --env-file .deploy/previous.env -f .deploy/previous-compose.yaml up -d --no-build --wait --wait-timeout 90 && \
   curl --fail --silent --show-error --max-time 15 --resolve kuniman.me:443:127.0.0.1 https://kuniman.me/healthz; then
  cp .deploy/previous.env .deploy/current.env
  cp .deploy/previous-compose.yaml .deploy/current-compose.yaml
  cp .deploy/rollback-current.env .deploy/previous.env
  cp .deploy/rollback-current-compose.yaml .deploy/previous-compose.yaml
  echo 'Previous release restored.'
else
  env -u KUNI_IMAGE -u KUNI_NETWORK docker compose --env-file .deploy/rollback-current.env -f .deploy/rollback-current-compose.yaml up -d --no-build --wait --wait-timeout 90
  echo 'Rollback verification failed; original release restored.' >&2
  exit 1
fi
