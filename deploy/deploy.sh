#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/.."
for tool in docker python3 curl flock git; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
docker compose version >/dev/null
mkdir -p .deploy/backups
if [[ "${KUNI_DEPLOY_LOCK_HELD:-0}" != 1 ]]; then exec 9>.deploy/lock; fi
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the project before deployment' >&2; exit 1; }
revision="$(git rev-parse --short=12 HEAD)"
caddy_file="${KUNI_CADDY_FILE:-/opt/remnawave/caddy/Caddyfile}"
[[ -f "$caddy_file" ]] || { echo "Missing Caddyfile: $caddy_file" >&2; exit 1; }
discovery="$(python3 deploy/discover_caddy.py "$caddy_file")"
IFS=$'\t' read -r caddy_id caddy_destination KUNI_NETWORK <<< "$discovery"
export KUNI_NETWORK
docker exec "$caddy_id" caddy version
docker exec "$caddy_id" caddy validate --config "$caddy_destination" --adapter caddyfile
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup=".deploy/backups/$stamp"
mkdir -p "$backup"
cp -p "$caddy_file" "$backup/Caddyfile"
python3 deploy/caddy_config.py "$caddy_file" "$backup/Caddyfile.candidate"

previous_image=''
if docker container inspect kuniman-web >/dev/null 2>&1; then
  owner="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' kuniman-web)"
  [[ "$owner" == kuniman ]] || { echo 'kuniman-web belongs to another project' >&2; exit 1; }
  previous_image="$(docker inspect --format '{{.Config.Image}}' kuniman-web)"
  [[ -f .deploy/current.env && -f .deploy/current-compose.yaml ]] || { echo 'Missing prior deployment state; refusing to replace the container' >&2; exit 1; }
  cp .deploy/current.env "$backup/previous.env"
  cp .deploy/current-compose.yaml "$backup/compose.yaml"
fi
export KUNI_IMAGE="kuniman:$revision"
docker compose -f compose.yaml config --quiet
printf 'Building release %s\n' "$revision"
docker build --tag "$KUNI_IMAGE" .

app_changed=0
caddy_changed=0
finished=0
rollback() {
  local result=$?
  trap - EXIT
  if [[ "$finished" == 0 ]]; then
    set +e
    echo 'Deployment failed; restoring the previous release/configuration.' >&2
    if [[ "$caddy_changed" == 1 ]]; then
      # Keep the inode: Caddyfile can be an individual bind mount.
      if cmp -s "$caddy_file" "$backup/Caddyfile.candidate"; then
        cat "$backup/Caddyfile" > "$caddy_file"
        docker exec "$caddy_id" caddy reload --config "$caddy_destination" --adapter caddyfile
      else
        echo 'Caddyfile changed externally; leaving those edits intact. Restore the managed block manually if needed.' >&2
      fi
    fi
    if [[ "$app_changed" == 1 ]]; then
      if [[ -n "$previous_image" ]]; then
        env -u KUNI_IMAGE -u KUNI_NETWORK docker compose --env-file "$backup/previous.env" -f "$backup/compose.yaml" up -d --no-build --wait --wait-timeout 90
      else
        docker compose -f compose.yaml rm -s -f web
      fi
    fi
    echo "Protected backup: $PWD/$backup" >&2
  fi
  exit "$result"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
app_changed=1
docker compose -f compose.yaml up -d --no-build --wait --wait-timeout 90
# Verify access through the same Docker network that Caddy uses.
docker exec "$caddy_id" wget -qO- http://kuniman-web:3000/healthz | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'

if ! cmp -s "$caddy_file" "$backup/Caddyfile.candidate"; then
  cmp -s "$caddy_file" "$backup/Caddyfile" || { echo 'Caddyfile changed during deployment; stopping' >&2; exit 1; }
  caddy_changed=1
  cat "$backup/Caddyfile.candidate" > "$caddy_file"
  docker exec "$caddy_id" caddy validate --config "$caddy_destination" --adapter caddyfile
  docker exec "$caddy_id" caddy reload --config "$caddy_destination" --adapter caddyfile
fi
# Cert issuance can take time; never suppress certificate validation.
curl --fail --silent --show-error --max-time 10 --retry 12 --retry-delay 5 --retry-all-errors \
  --resolve kuniman.me:443:127.0.0.1 https://kuniman.me/healthz | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'
curl --fail --silent --show-error --max-time 15 --resolve kuniman.me:443:127.0.0.1 \
  https://kuniman.me/ > "$backup/page.html"
grep -q 'kuniman' "$backup/page.html"
curl --fail --silent --show-error --max-time 30 --resolve kuniman.me:443:127.0.0.1 \
  https://kuniman.me/rig/kuniman.glb > "$backup/model.glb"
cmp -s public/rig/kuniman.glb "$backup/model.glb"

if [[ -f .deploy/current.env ]]; then
  cp .deploy/current.env .deploy/previous.env
  cp .deploy/current-compose.yaml .deploy/previous-compose.yaml
fi
printf 'KUNI_IMAGE=%s\nKUNI_NETWORK=%s\n' "$KUNI_IMAGE" "$KUNI_NETWORK" > .deploy/current.env
cp compose.yaml .deploy/current-compose.yaml
finished=1
echo 'Deployment verified: https://kuniman.me'
docker compose -f compose.yaml ps
