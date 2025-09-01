#!/usr/bin/env bash

# Close any open System Preferences panes, to prevent them from overriding settings we’re about to change
osascript -e 'tell application "System Preferences" to quit'

# Ask for the administrator password upfront
sudo -v

# Keep-alive: update existing `sudo` time stamp until the script has finished
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

###############################################################################
# Dock                                                                        #
###############################################################################

# Wipe all app icons from the Dock
defaults write com.apple.dock persistent-apps -array

# Set the icon size of Dock items to 40 pixels
defaults write com.apple.dock tilesize -int 40

# Set the magnification size of Dock items to 50 pixels
defaults write com.apple.dock largesize -int 50

# Automatically hide and show the Dock
defaults write com.apple.dock autohide -bool true

# Disable delay for autohide
defaults write com.apple.dock autohide-delay -float 0

# Autohide faster animation
defaults write com.apple.dock autohide-time-modifier -float 0.15

# Don’t show recent applications in Dock
defaults write com.apple.dock show-recents -bool false

###############################################################################
# Battery                                                                     #
###############################################################################

# Disable start on connect to power
sudo nvram BootPreference=%02

###############################################################################
# Finder                                                                      #
###############################################################################

# Show the ~/Library folder
chflags nohidden ~/Library

###############################################################################
# Multitouch                                                                  #
###############################################################################

defaults write com.brassmonkery.Multitouch almostMaximizeWidth -float 0.975
defaults write com.brassmonkery.Multitouch almostMaximizeHeight -float 0.975

###############################################################################
# Kill affected applications                                                  #
###############################################################################

for app in "Dock" "Finder" "ControlCenter"; do
	killall "${app}" &> /dev/null
done