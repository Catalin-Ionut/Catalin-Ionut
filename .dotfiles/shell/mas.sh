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
    # "1596283165:RCmd"
    # "1592917505:Noir"
    "1662217862:Wipr"
    "6446206067:Klack"
    # "408981434:iMovie"
    "1355679052:Dropover"
    # "1458969831:JSON Peep"
    # "1452453066:Hidden Bar"
    # "937984704:Amphetamine"
    "6743048714:Googly Eyes"
    # "1006087419:SnippetsLab"
    "463362050:Photo Sweeper"
    "402569179:Find Any File"
    "462054704:Microsoft Word"
    # "1294126402:HEIC Converter"
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