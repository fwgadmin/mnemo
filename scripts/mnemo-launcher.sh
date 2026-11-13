#!/usr/bin/env bash
# Dispatches `mnemo` on Linux: GUI (Electron) vs CLI (same Electron binary as Node + bundled deps).
set -euo pipefail
# /usr/bin/mnemo is a symlink to this script: resolve it so paths point at the install dir.
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
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

# Run a short script with the bundled Electron as Node (no system Node.js required).
electron_node() {
  ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$@"
}

# Matches bin/mnemo.js shouldRunVaultCli — keep routing in sync.
should_run_vault_cli() {
  electron_node -e '
  const argv = process.argv.slice(1);
  if (argv.length === 0) {
    process.exit(0);
  }
  const cmd = argv[0];
  const vault = new Set([
    "help","mcp","note","completion","workspace","sheet","add","a","find","f","search","import","graph",
    "categories","autolink","list","set-category","category","compose","write","edit","delete","rm","sync",
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
  electron_node -e "
  const fs=require('fs');const p=require('path');const os=require('os');
  function cp(){const x=process.env.XDG_CONFIG_HOME||p.join(os.homedir(),'.config');return p.join(x,'mnemo','cli.json');}
  try{const j=JSON.parse(fs.readFileSync(cp(),'utf8'));if(j.bareCommand==='gui'||j.bareCommand==='recent'){process.stdout.write(j.bareCommand);process.exit(0)}}catch(e){}
  process.stdout.write('recent');
  " 2>/dev/null || echo recent
}

# Chromium aborts with a cryptic SUID-sandbox error when unprivileged user namespaces are restricted
# (Ubuntu 23.10+) and no AppArmor profile allows them. Explain the fix instead.
sandbox_hint() {
  [[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "1" ]] || return 0
  [[ -f /etc/apparmor.d/mnemo ]] && return 0
  [[ -u "$ROOT/chrome-sandbox" && "$(stat -c %U "$ROOT/chrome-sandbox" 2>/dev/null)" == "root" ]] && return 0
  cat >&2 <<HINT
Mnemo: this system restricts unprivileged user namespaces, which Mnemo's sandbox needs.
  Install the AppArmor profile once (needs sudo):
    sudo "$HERE/apparmor-profile.sh" install "$ELECTRON"
  or install the .deb package, which does this automatically.
HINT
}

run_gui() {
  sandbox_hint
  exec "$ELECTRON" "$@"
}

if [[ $# -eq 0 ]]; then
  if [[ "$(read_bare_command)" == "gui" ]]; then
    run_gui "$@"
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
      run_gui "$@"
      ;;
  esac
  if should_run_vault_cli "$@"; then
    run_cli "$@"
  fi
fi

run_gui "$@"
