#!/usr/bin/env bash

set -euo pipefail

# Check if mas is installed
if ! command -v mas &>/dev/null; then
    echo "MAS is not installed. Please install it first."
    exit 1
fi

# Array of apps to install (id:name)
apps=(
    "1544743900:Hush"
    "1592917505:Noir"
    "1662217862:Wipr"
    "408981434:iMovie"
    "6446206067:Klack"
    "1586435171:Actions"
    "1355679052:Dropover"
    "6753302381:KeyScreen"
    "1507246666:Presentify"
    "463362050:PhotoSweeper"
    "402569179:Find Any File"
    "462054704:Microsoft Word"
    "462058435:Microsoft Excel"
    "462062816:Microsoft Powerpoint"
)

for app in "${apps[@]}"; do
    id="${app%%:*}"
    name="${app#*:}"

    if mas list | awk '{print $1}' | grep -q "^$id$"; then
        if mas upgrade "$id" | grep -q .; then
            echo "Updated $name"
        fi
    else
        if mas install "$id" >/dev/null 2>&1; then
            echo "Installed $name"
        fi
    fi
done