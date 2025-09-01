#!/usr/bin/env bash

set -euo pipefail

# Check if mas is installed
if ! command -v mas &>/dev/null; then
    echo "Mas is not installed. Install it first (brew install mas)." >&2
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
    "463362050:PhotoSweeper"
    "402569179:Find Any File"
    "462054704:Microsoft Word"
    "462058435:Microsoft Excel"
    "462062816:Microsoft Powerpoint"
)

echo "Mac App Store apps (${#apps[@]} total)"

# Fetch the list of installed app IDs once, instead of calling `mas list` per app.
installed="$(mas list | awk '{print $1}')"

for app in "${apps[@]}"; do
    id="${app%%:*}"
    name="${app#*:}"

    if grep -qx "$id" <<<"$installed"; then
        echo "  - ${name}: installed, checking for updates"

        if ! mas upgrade "$id"; then
            echo "    already up to date"
        fi
    else
        echo "  - ${name}: installing"

        if mas install "$id"; then
            echo "    installed"
        else
            echo "    failed to install ${name}" >&2
        fi
    fi
done
