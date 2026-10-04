#!/bin/bash
# Run in Terminal on the Mac. SSH and GitHub handle their own login prompts.
set -Eeuo pipefail
project_source="$(cd "$(dirname "$0")" && pwd -P)"
project_target="$HOME/Project/kuniman"
for tool in git gh ssh curl; do
  command -v "$tool" >/dev/null || { echo "Не найден $tool" >&2; exit 1; }
done
if [[ "$project_source" != "$project_target" ]]; then
  [[ ! -e "$project_target" ]] || { echo "Папка $project_target уже существует; ничего не перезаписано" >&2; exit 1; }
  mkdir -p "$HOME/Project"
  mv "$project_source" "$project_target"
fi
cd "$project_target"
if ! gh auth status >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web
fi
[[ "$(gh api user --jq .login)" == dmitryfun ]] || { echo 'Нужен вход GitHub под dmitryfun' >&2; exit 1; }
gh auth setup-git --hostname github.com
[[ "$(git remote get-url origin)" == 'https://github.com/dmitryfun/kuni.git' ]] || { echo 'Неожиданный origin' >&2; exit 1; }
[[ "$(git branch --show-current)" == main && -z "$(git status --porcelain)" ]] || { echo 'Сначала сохрани изменения коммитом в main' >&2; exit 1; }
git push --set-upstream origin main
revision="$(git rev-parse HEAD)"
# A private temporary directory keeps the SSH control socket separate.
socket_dir="$(mktemp -d "${TMPDIR:-/tmp}/kuniman-ssh.XXXXXX")"
cleanup() { rm -rf "$socket_dir"; }
trap cleanup EXIT
ssh_options=(-o ControlMaster=auto -o ControlPersist=60 -o "ControlPath=$socket_dir/%C" -o ConnectTimeout=15 -o StrictHostKeyChecking=ask)
ssh "${ssh_options[@]}" root@87.120.165.181 "bash -s -- $revision" < deploy/bootstrap.sh
curl --fail --silent --show-error --max-time 15 https://kuniman.me/healthz
printf '\nГотово: https://kuniman.me\nПроект: %s\n' "$project_target"
