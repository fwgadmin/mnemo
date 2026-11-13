#!/bin/sh
# Install or remove an AppArmor profile that lets Mnemo's Chromium sandbox use unprivileged user
# namespaces. Needed on distributions that restrict them (Ubuntu 23.10+:
# kernel.apparmor_restrict_unprivileged_userns=1); without it the app aborts at startup.
# Same approach as Obsidian, VS Code, Slack: the profile is unconfined except for granting `userns`,
# so the renderer sandbox stays enabled.
#
#   apparmor-profile.sh install [/path/to/Mnemo]   (default /usr/lib/mnemo/Mnemo)
#   apparmor-profile.sh remove
set -eu
PROFILE=/etc/apparmor.d/mnemo
action="${1:-install}"
exe="${2:-/usr/lib/mnemo/Mnemo}"

have_apparmor() {
  [ -d /etc/apparmor.d ] && command -v apparmor_parser >/dev/null 2>&1 && [ -f /etc/apparmor.d/abi/4.0 ]
}

case "$action" in
  install)
    have_apparmor || exit 0
    case "$exe" in
      /*) ;;
      *) echo "apparmor-profile.sh: executable path must be absolute" >&2; exit 1 ;;
    esac
    cat > "$PROFILE" <<PROFILE_EOF
abi <abi/4.0>,
include <tunables/global>

profile mnemo "$exe" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/mnemo>
}
PROFILE_EOF
    apparmor_parser -r -T -W "$PROFILE" || echo "Mnemo: could not load $PROFILE (it will load on next boot)" >&2
    ;;
  remove)
    if [ -f "$PROFILE" ]; then
      command -v apparmor_parser >/dev/null 2>&1 && apparmor_parser -R "$PROFILE" 2>/dev/null || true
      rm -f "$PROFILE"
    fi
    ;;
  *)
    echo "usage: $0 install [/path/to/Mnemo] | remove" >&2
    exit 1
    ;;
esac
