#!/usr/bin/env bash
# Dispatches `mnemo` on Linux: GUI (Electron) vs CLI (same Electron binary as Node + bundled deps).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ELECTRON="$ROOT/Mnemo"
CLI_JS="$HERE/mnemo-cli.js"
HTTP_JS="$HERE/mnemo-mcp-http.js"
NODE_PATH="$HERE/node_modules"

if [[ ! -x "$ELECTRON" ]]; then
  echo "Mnemo: expected Electron binary at $ELECTRON" >&2
  exit 1
fi

run_cli() {
  if [[ ! -f "$CLI_JS" ]]; then
    echo "Mnemo: missing $CLI_JS (reinstall the package)" >&2
    exit 1
  fi
  export ELECTRON_RUN_AS_NODE=1
  export NODE_PATH
  exec "$ELECTRON" "$CLI_JS" "$@"
}

if [[ $# -ge 1 ]]; then
  case "$1" in
    mcp|note|completion)
      run_cli "$@"
      ;;
    mcp-http)
      if [[ ! -f "$HTTP_JS" ]]; then
        echo "Mnemo: missing $HTTP_JS" >&2
        exit 1
      fi
      export NODE_PATH
      exec /usr/bin/env node "$HTTP_JS"
      ;;
  esac
fi

exec "$ELECTRON" "$@"
