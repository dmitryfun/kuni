#!/bin/zsh
set -e
cd -- "${0:A:h}"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" && -x "$HOME/.local/bin/node" ]]; then
  NODE_BIN="$HOME/.local/bin/node"
fi
if [[ -z "$NODE_BIN" ]]; then
  echo 'Не найден Node.js. Для запуска нужен установленный Node.js.'
  read '?Нажми Enter для закрытия.'
  exit 1
fi

export NEXT_TELEMETRY_DISABLED=1
echo 'После сообщения Ready сайт доступен: http://127.0.0.1:3156'
exec "$NODE_BIN" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3156
