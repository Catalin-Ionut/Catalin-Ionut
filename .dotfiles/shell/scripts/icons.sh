#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

have fileicon || die "fileicon is not installed. Install it first (brew install fileicon)."

ICONS_DIR="$SCRIPT_DIR/../../icons"

################################################################################
# Apps  (icons/<name>.icns is applied to <name>.app)
################################################################################

apps=(
    "/Applications/PhpStorm.app"
    "/Applications/Discord.app"
)

################################################################################
# Apply
################################################################################

log "Application icons (${#apps[@]} total)"

for app in "${apps[@]}"; do
    name="$(basename "$app" .app)"
    icon="$ICONS_DIR/$name.icns"

    item "$name"

    if [[ ! -d "$app" ]]; then
        info "not installed; skipping"
        continue
    fi

    if [[ ! -f "$icon" ]]; then
        warn "missing icon $name.icns"
        continue
    fi

    fileicon set -q "$app" "$icon" || warn "failed to set icon for $name"
done
