#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

. "$SCRIPT_DIR/../helper.sh"

log "Applying macOS settings"

for settings_app in "System Settings" "System Preferences"; do
    osascript -e "tell application \"$settings_app\" to quit" 2>/dev/null || true
done

################################################################################
# Dock
################################################################################

item "Dock"
defaults write com.apple.dock tilesize -int 40
defaults write com.apple.dock largesize -int 50
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock autohide-time-modifier -float 0.15
defaults write com.apple.dock show-recents -bool false

################################################################################
# Battery
################################################################################

item "Battery"
sudo nvram BootPreference=%02

################################################################################
# Finder
################################################################################

item "Finder"
chflags nohidden ~/Library

################################################################################
# Multitouch
################################################################################

item "Multitouch"
defaults write com.brassmonkery.Multitouch almostMaximizeWidth -float 0.75
defaults write com.brassmonkery.Multitouch almostMaximizeHeight -float 0.75

################################################################################
# Restart affected applications
################################################################################

item "Restarting Dock, Finder, ControlCenter"
for app in "Dock" "Finder" "ControlCenter"; do
    killall "${app}" &>/dev/null || true
done
