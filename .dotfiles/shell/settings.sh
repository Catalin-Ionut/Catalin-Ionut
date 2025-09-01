#!/usr/bin/env bash

set -uo pipefail

echo "Applying macOS settings"

# Close the settings app so it can't overwrite the values we set below.
# (Renamed from "System Preferences" to "System Settings" in macOS Ventura.)
osascript -e 'tell application "System Settings" to quit' 2>/dev/null || true
osascript -e 'tell application "System Preferences" to quit' 2>/dev/null || true

# Ask for the administrator password upfront, then keep sudo alive until we finish.
sudo -v
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

###############################################################################
# Dock                                                                        #
###############################################################################
echo "  - Dock"
defaults write com.apple.dock tilesize -int 40                   # icon size
defaults write com.apple.dock largesize -int 50                  # magnified size
defaults write com.apple.dock autohide -bool true                # auto-hide
defaults write com.apple.dock autohide-delay -float 0            # no show delay
defaults write com.apple.dock autohide-time-modifier -float 0.15 # faster anim
defaults write com.apple.dock show-recents -bool false           # hide recents

###############################################################################
# Battery                                                                     #
###############################################################################
echo "  - Battery: disable start-on-power-connect"
sudo nvram BootPreference=%02

###############################################################################
# Finder                                                                      #
###############################################################################
echo "  - Finder: show ~/Library"
chflags nohidden ~/Library

###############################################################################
# Multitouch                                                                  #
###############################################################################
echo "  - Multitouch: almost-maximize size"
defaults write com.brassmonkery.Multitouch almostMaximizeWidth -float 0.75
defaults write com.brassmonkery.Multitouch almostMaximizeHeight -float 0.75

###############################################################################
# Restart affected applications                                               #
###############################################################################
echo "  - Restarting Dock, Finder, ControlCenter"
for app in "Dock" "Finder" "ControlCenter"; do
    killall "${app}" &>/dev/null || true
done
