#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

have mas || die "mas is not installed. Install it first (brew install mas)."

################################################################################
# Apps  (id:name)
################################################################################

apps=(
    "1544743900:Hush"
    "1592917505:Noir"
    "1662217862:Wipr"
    "408981434:iMovie"
    "6446206067:Klack"
    "1586435171:Actions"
    "1355679052:Dropover"
    "463362050:PhotoSweeper"
    "402569179:Find Any File"
    "462054704:Microsoft Word"
    "462058435:Microsoft Excel"
    "462062816:Microsoft Powerpoint"
)

################################################################################
# Install / upgrade
################################################################################

log "Mac App Store apps (${#apps[@]} total)"

if ! installed="$(mas list | awk '{print $1}')"; then
    warn "could not list installed apps; treating them all as missing"
    installed=""
fi

for app in "${apps[@]}"; do
    id="${app%%:*}"
    name="${app#*:}"

    item "$name"

    if list_has "$installed" "$id"; then
        mas upgrade "$id" || warn "failed to upgrade $name"
    elif mas install "$id"; then
        info "installed"
    else
        warn "failed to install $name"
    fi
done
