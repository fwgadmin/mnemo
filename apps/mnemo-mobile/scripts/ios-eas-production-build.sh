#!/usr/bin/env bash
# First-time iOS production build: run this in a normal terminal (not CI).
# EAS must validate your Apple distribution certificate interactively once; after that,
# `eas build --platform ios --profile production --non-interactive` can work from CI.
set -euo pipefail
cd "$(dirname "$0")/.."
export EAS_BUILD_NO_EXPO_GO_WARNING=1
exec npx eas-cli build --platform ios --profile production "$@"
