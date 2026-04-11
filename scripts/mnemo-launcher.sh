#!/usr/bin/env bash
# Dispatches `mnemo` on Linux: GUI (Electron) vs CLI (same Electron binary as Node + bundled deps).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ELECTRON="$ROOT/Mnemo"
CLI_JS="$HERE/mnemo-cli.js"
HTTP_JS="$HERE/mnemo-mcp-http.js"
NODE_PATH="$HERE/node_modules"

# Chromium’s setuid sandbox helper is not root-owned in shipped bundles; Electron aborts without this.
export ELECTRON_DISABLE_SANDBOX=1

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

# Matches bin/mnemo.js shouldRunVaultCli — keep routing in sync.
should_run_vault_cli() {
  node -e '
  const argv = process.argv.slice(1);
  if (argv.length === 0) {
    process.exit(0);
  }
  const cmd = argv[0];
  const vault = new Set([
    "help","mcp","note","completion","add","a","find","f","search","import","graph",
    "categories","autolink","list","set-category","category","compose","write","edit",
  ]);
  if (vault.has(cmd)) process.exit(0);
  if (/^\d+$/.test(cmd)) process.exit(0);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cmd)) process.exit(0);
  const lc = cmd.toLowerCase();
  if (argv.length === 1 && lc !== "gui" && lc !== "mcp-http") process.exit(0);
  process.exit(1);
  ' -- "$@" 2>/dev/null
}

read_bare_command() {
  if [[ -n "${MNEMO_CLI_BARE:-}" ]]; then
    case "${MNEMO_CLI_BARE}" in
      gui|recent) echo "${MNEMO_CLI_BARE}"; return ;;
    esac
  fi
  node -e "
  const fs=require('fs');const p=require('path');const os=require('os');
  function cp(){const x=process.env.XDG_CONFIG_HOME||p.join(os.homedir(),'.config');return p.join(x,'mnemo','cli.json');}
  try{const j=JSON.parse(fs.readFileSync(cp(),'utf8'));if(j.bareCommand==='gui'||j.bareCommand==='recent'){process.stdout.write(j.bareCommand);process.exit(0)}}catch(e){}
  process.stdout.write('recent');
  " 2>/dev/null || echo recent
}

if [[ $# -eq 0 ]]; then
  if [[ "$(read_bare_command)" == "gui" ]]; then
    exec "$ELECTRON" "$@"
  else
    run_cli "$@"
  fi
fi

if [[ $# -ge 1 ]]; then
  _lc1="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$_lc1" in
    mcp-http)
      if [[ ! -f "$HTTP_JS" ]]; then
        echo "Mnemo: missing $HTTP_JS" >&2
        exit 1
      fi
      export NODE_PATH
      exec /usr/bin/env node "$HTTP_JS"
      ;;
    gui)
      exec "$ELECTRON" "$@"
      ;;
  esac
  if should_run_vault_cli "$@"; then
    run_cli "$@"
  fi
fi

exec "$ELECTRON" "$@"
