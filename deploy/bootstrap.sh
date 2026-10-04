#!/usr/bin/env bash
# Runs on the server over SSH. No credentials are stored here.
set -Eeuo pipefail
revision="${1:?Expected Git revision is required}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid Git revision' >&2; exit 1; }
for tool in git docker python3 curl flock; do
  command -v "$tool" >/dev/null || { echo "Missing server dependency: $tool" >&2; exit 1; }
done
docker compose version >/dev/null
repository='https://github.com/dmitryfun/kuni.git'
project="$HOME/Project/kuniman"
mkdir -p "$HOME/Project"
if [[ ! -e "$project" ]]; then
  git clone --branch main "$repository" "$project"
fi
cd "$project"
mkdir -p .deploy
exec 9>.deploy/lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
export KUNI_DEPLOY_LOCK_HELD=1
[[ "$(git remote get-url origin)" == "$repository" ]] || { echo 'Unexpected server repository; leaving it intact' >&2; exit 1; }
[[ "$(git branch --show-current)" == main && -z "$(git status --porcelain)" ]] || { echo 'Server checkout must be clean on main' >&2; exit 1; }
git fetch origin main
git merge --ff-only origin/main
[[ "$(git rev-parse HEAD)" == "$revision" ]] || { echo 'Published revision changed; rerun publication' >&2; exit 1; }
exec bash deploy/deploy.sh
